//! Disposable in-process SSH server (russh) used by integration tests for
//! remote execution and SFTP transfer. Test-only; never compiled into the app.

#![cfg(test)]

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use russh::server::{Auth, Msg, Server as _, Session};
use russh::{Channel, ChannelId};
use russh_sftp::protocol::{
    Attrs, Data, File, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode, Version,
};
use tokio::sync::Mutex;

pub const TEST_USER: &str = "deployer";
pub const TEST_PASSWORD: &str = "test-pass";

const HOST_KEY: &str = concat!(
    "-----BEGIN OPENSSH PRIVATE KEY-----\n",
    "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n",
    "QyNTUxOQAAACAV/H5nRXY9yAj4aOxt9DGDWwUSgfLjR20NKj9PM4v2wAAAAJjGb2XCxm9l\n",
    "wgAAAAtzc2gtZWQyNTUxOQAAACAV/H5nRXY9yAj4aOxt9DGDWwUSgfLjR20NKj9PM4v2wA\n",
    "AAAEDdsF3ChRCmuTF5QneUrYdlzFxrWNgCFFWOHWCCvK6ewBX8fmdFdj3ICPho7G30MYNb\n",
    "BRKB8uNHbQ0qP08zi/bAAAAADkFuYW5kQEFuYW5kX0FLAQIDBAUGBw==\n",
    "-----END OPENSSH PRIVATE KEY-----\n",
);

/// Canned behavior for exec channels and the in-memory SFTP filesystem.
#[derive(Clone, Default)]
pub struct TestBehavior {
    pub exec_stdout: String,
    pub exec_stderr: String,
    pub exec_exit_code: u32,
}

struct TestServer {
    behavior: Arc<Mutex<TestBehavior>>,
    files: Arc<Mutex<HashMap<String, Vec<u8>>>>,
}

impl russh::server::Server for TestServer {
    type Handler = TestHandler;

    fn new_client(&mut self, _: Option<SocketAddr>) -> Self::Handler {
        TestHandler {
            behavior: Arc::clone(&self.behavior),
            files: Arc::clone(&self.files),
            channels: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

struct TestHandler {
    behavior: Arc<Mutex<TestBehavior>>,
    files: Arc<Mutex<HashMap<String, Vec<u8>>>>,
    channels: Arc<Mutex<HashMap<ChannelId, Channel<Msg>>>>,
}

impl TestHandler {
    async fn take_channel(&self, id: ChannelId) -> Option<Channel<Msg>> {
        self.channels.lock().await.remove(&id)
    }
}

impl russh::server::Handler for TestHandler {
    type Error = russh::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        if user == TEST_USER && password == TEST_PASSWORD {
            Ok(Auth::Accept)
        } else {
            Ok(Auth::reject())
        }
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply: russh::server::ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let id = channel.id();
        self.channels.lock().await.insert(id, channel);
        reply.accept().await;
        Ok(())
    }

    async fn channel_eof(&mut self, channel: ChannelId, session: &mut Session) -> Result<(), Self::Error> {
        session.close(channel)?;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        _data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        let behavior = self.behavior.lock().await.clone();
        session.channel_success(channel)?;
        if !behavior.exec_stdout.is_empty() {
            session.data(channel, behavior.exec_stdout.clone().into_bytes())?;
        }
        if !behavior.exec_stderr.is_empty() {
            session.extended_data(channel, 1, behavior.exec_stderr.clone().into_bytes())?;
        }
        session.exit_status_request(channel, behavior.exec_exit_code)?;
        session.eof(channel)?;
        session.close(channel)?;
        Ok(())
    }

    async fn subsystem_request(
        &mut self,
        channel: ChannelId,
        name: &str,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        if name != "sftp" {
            session.channel_failure(channel)?;
            return Ok(());
        }
        let Some(channel_handle) = self.take_channel(channel).await else {
            session.channel_failure(channel)?;
            return Ok(());
        };
        session.channel_success(channel)?;
        let files = Arc::clone(&self.files);
        russh_sftp::server::run(
            channel_handle.into_stream(),
            SftpServer { files },
        )
        .await;
        Ok(())
    }
}

/// Minimal in-memory SFTP filesystem supporting open/write/read/close/stat.
struct SftpServer {
    files: Arc<Mutex<HashMap<String, Vec<u8>>>>,
}

impl russh_sftp::server::Handler for SftpServer {
    type Error = StatusCode;

    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn init(
        &mut self,
        _version: u32,
        _extensions: HashMap<String, String>,
    ) -> Result<Version, Self::Error> {
        Ok(Version::new())
    }

    async fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: OpenFlags,
        _attrs: FileAttributes,
    ) -> Result<Handle, Self::Error> {
        let mut files = self.files.lock().await;
        if pflags.contains(OpenFlags::TRUNCATE) {
            files.remove(&filename);
        }
        if pflags.contains(OpenFlags::CREATE) && !files.contains_key(&filename) {
            files.insert(filename.clone(), Vec::new());
        }
        if !files.contains_key(&filename) {
            return Err(StatusCode::NoSuchFile);
        }
        Ok(Handle {
            id,
            handle: filename,
        })
    }

    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Status, Self::Error> {
        let mut files = self.files.lock().await;
        let file = files.entry(handle).or_default();
        let end = offset as usize + data.len();
        if file.len() < end {
            file.resize(end, 0);
        }
        file[offset as usize..end].copy_from_slice(&data);
        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<Data, Self::Error> {
        let files = self.files.lock().await;
        let Some(content) = files.get(&handle) else {
            return Err(StatusCode::NoSuchFile);
        };
        let start = (offset as usize).min(content.len());
        let end = ((offset as usize) + len as usize).min(content.len());
        if start >= end {
            // EOF is signalled by an empty data payload.
            return Ok(Data {
                id,
                data: Vec::new(),
            });
        }
        Ok(Data {
            id,
            data: content[start..end].to_vec(),
        })
    }

    async fn close(&mut self, id: u32, _handle: String) -> Result<Status, Self::Error> {
        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn setstat(
        &mut self,
        id: u32,
        _path: String,
        _attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn fstat(&mut self, id: u32, handle: String) -> Result<Attrs, Self::Error> {
        let files = self.files.lock().await;
        let Some(content) = files.get(&handle) else {
            return Err(StatusCode::NoSuchFile);
        };
        Ok(Attrs {
            id,
            attrs: FileAttributes {
                size: Some(content.len() as u64),
                ..Default::default()
            },
        })
    }
}

/// Spawn a disposable SSH server bound to a random local port.
/// Returns (port, shared in-memory files, exec behavior control).
pub async fn spawn() -> (
    u16,
    Arc<Mutex<HashMap<String, Vec<u8>>>>,
    Arc<Mutex<TestBehavior>>,
) {
    let files: Arc<Mutex<HashMap<String, Vec<u8>>>> = Arc::new(Mutex::new(HashMap::new()));
    let behavior = Arc::new(Mutex::new(TestBehavior::default()));
    let server = TestServer {
        behavior: Arc::clone(&behavior),
        files: Arc::clone(&files),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind test SSH server");
    let port = listener.local_addr().expect("local addr").port();
    let config = Arc::new(russh::server::Config {
        auth_rejection_time: Duration::from_millis(10),
        auth_rejection_time_initial: Some(Duration::from_millis(0)),
        keys: vec![russh::keys::decode_secret_key(HOST_KEY, None).expect("decode test host key")],
        ..Default::default()
    });
    tokio::spawn(async move {
        let mut server = server;
        let _ = server.run_on_socket(config, &listener).await;
    });
    (port, files, behavior)
}

/// Initialize the global master key location for SSH secret encryption.
pub fn init_master_key() {
    static INIT: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
    let dir = INIT.get_or_init(|| {
        let dir = std::env::temp_dir().join(format!(
            "scriptmanager-test-master-key-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        dir
    });
    crate::security::init_key_dir_for_tests(dir.clone());
}
