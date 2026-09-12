//! SSH/SFTP transport for remote execution, built on russh + russh-sftp.
//!
//! Security model (docs/tauri-remote-exec-ssh.md):
//! - no shell-built commands; commands go through SSH `exec` requests and
//!   transfers go through SFTP,
//! - profile secrets are decrypted from SQLite only at connection time,
//! - host keys are pinned per profile (SHA-256 fingerprint); first contact
//!   records the fingerprint, any later mismatch is a hard error,
//! - secrets are never included in events, output, logs, or error strings.

use std::sync::Arc;

use russh::keys::{HashAlg, PrivateKeyWithHashAlg};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use sqlx::{Row, SqlitePool};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub const SSH_CONNECT_TIMEOUT_SECS: u64 = 15;
pub const SSH_COMMAND_TIMEOUT_SECS: u64 = 300;
pub const SSH_TRANSFER_TIMEOUT_SECS: u64 = 120;

/// Exit code used for SSH-level failures (transport/auth), matching the
/// convention of ssh(1) for connection errors.
pub const SSH_TRANSPORT_EXIT_CODE: i64 = 255;

#[derive(Debug, Clone)]
pub struct SshProfileConnection {
    pub profile_id: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub key_passphrase: Option<String>,
    pub stored_fingerprint: Option<String>,
}

/// Load a server profile plus its decrypted secret for immediate
/// connection use. Resolves by id first, then by display name (older
/// workflow configs stored names). The secret never leaves this module.
pub async fn load_profile_connection(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<SshProfileConnection, String> {
    let row = sqlx::query(
        "SELECT id, host, port, username, auth_method, encrypted_secret, key_path, host_key_fingerprint
         FROM server_profiles WHERE id = ?1 OR name = ?1 ORDER BY (id = ?1) DESC LIMIT 1",
    )
    .bind(profile_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Server profile not found".to_string())?;

    let encrypted: Option<String> = row.try_get(5).map_err(|e| e.to_string())?;
    let password = match encrypted.as_deref() {
        Some(encrypted) if !encrypted.is_empty() => {
            let key = crate::security::current_master_key()?;
            let plaintext = crate::security::decrypt_value(&key, encrypted)?;
            if plaintext.is_empty() {
                None
            } else {
                Some(plaintext)
            }
        }
        _ => None,
    };

    Ok(SshProfileConnection {
        profile_id: row.try_get(0).map_err(|e| e.to_string())?,
        host: row.try_get(1).map_err(|e| e.to_string())?,
        port: row.try_get(2).map_err(|e| e.to_string())?,
        username: row.try_get(3).map_err(|e| e.to_string())?,
        auth_method: row.try_get(4).map_err(|e| e.to_string())?,
        password,
        key_path: row
            .try_get::<Option<String>, _>(6)
            .map_err(|e| e.to_string())?
            .filter(|p| !p.trim().is_empty()),
        key_passphrase: None,
        stored_fingerprint: row
            .try_get::<Option<String>, _>(7)
            .map_err(|e| e.to_string())?
            .filter(|p| !p.trim().is_empty()),
    })
}

/// Encrypt and persist a profile secret. Returns the ciphertext for storage.
pub fn encrypt_profile_secret(secret: &str) -> Result<String, String> {
    let key = crate::security::current_master_key()?;
    crate::security::encrypt_value(&key, secret)
}

struct ClientHandler {
    stored_fingerprint: Option<String>,
    learned_fingerprint: Arc<tokio::sync::Mutex<Option<String>>>,
}

impl russh::client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let fingerprint = match server_public_key {
            russh::keys::PublicKeyOrCertificate::PublicKey { key, .. } => {
                key.fingerprint(HashAlg::Sha256).to_string()
            }
            russh::keys::PublicKeyOrCertificate::Certificate(cert) => cert
                .public_key()
                .fingerprint(HashAlg::Sha256)
                .to_string(),
        };
        match &self.stored_fingerprint {
            Some(expected) => {
                if *expected == fingerprint {
                    Ok(true)
                } else {
                    // Host key changed: reject instead of silently trusting.
                    Ok(false)
                }
            }
            None => {
                // Trust-on-first-use: record the fingerprint so it can be
                // persisted and shown to the user after the session opens.
                *self.learned_fingerprint.lock().await = Some(fingerprint);
                Ok(true)
            }
        }
    }
}

/// An established, authenticated SSH session.
pub struct SshSession {
    handle: russh::client::Handle<ClientHandler>,
    pub host_key_fingerprint: Option<String>,
}

impl SshSession {
    /// Connect and authenticate a profile. Returns the session and the
    /// learned host-key fingerprint when it was seen for the first time.
    pub async fn connect(profile: &SshProfileConnection) -> Result<SshSession, String> {
        let config = Arc::new(russh::client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(
                SSH_COMMAND_TIMEOUT_SECS.max(SSH_TRANSFER_TIMEOUT_SECS),
            )),
            keepalive_interval: Some(std::time::Duration::from_secs(30)),
            ..Default::default()
        });
        let learned_fingerprint = Arc::new(tokio::sync::Mutex::new(None));
        let handler = ClientHandler {
            stored_fingerprint: profile.stored_fingerprint.clone(),
            learned_fingerprint: Arc::clone(&learned_fingerprint),
        };

        let mut handle = tokio::time::timeout(
            std::time::Duration::from_secs(SSH_CONNECT_TIMEOUT_SECS),
            russh::client::connect(config, (profile.host.as_str(), profile.port as u16), handler),
        )
        .await
        .map_err(|_| {
            format!(
                "SSH connection to {}:{} timed out",
                profile.host, profile.port
            )
        })?
        .map_err(|e| format!("SSH connection to {}:{} failed: {e}", profile.host, profile.port))?;

        let learned = learned_fingerprint.lock().await.clone();

        Self::authenticate(&mut handle, profile).await?;

        let fingerprint = if profile.stored_fingerprint.is_some() {
            None
        } else {
            learned
        };
        Ok(SshSession {
            handle,
            host_key_fingerprint: fingerprint,
        })
    }

    async fn authenticate(
        handle: &mut russh::client::Handle<ClientHandler>,
        profile: &SshProfileConnection,
    ) -> Result<(), String> {
        let auth_result = match profile.auth_method.as_str() {
            "key" => {
                let key_path = profile
                    .key_path
                    .as_ref()
                    .filter(|p| !p.trim().is_empty())
                    .ok_or_else(|| "Profile uses key auth but has no key path".to_string())?;
                let key = russh::keys::load_secret_key(key_path, profile.key_passphrase.as_deref())
                    .map_err(|e| format!("Failed to load SSH key: {e}"))?;
                handle
                    .authenticate_publickey(
                        profile.username.clone(),
                        PrivateKeyWithHashAlg::new(Arc::new(key), None),
                    )
                    .await
                    .map_err(|e| format!("SSH key authentication failed: {e}"))?
            }
            _ => {
                let password = profile
                    .password
                    .clone()
                    .filter(|p| !p.is_empty())
                    .ok_or_else(|| "Profile uses password auth but no secret is stored".to_string())?;
                handle
                    .authenticate_password(profile.username.clone(), password)
                    .await
                    .map_err(|e| format!("SSH password authentication failed: {e}"))?
            }
        };
        if auth_result.success() {
            Ok(())
        } else {
            Err(format!(
                "SSH authentication failed for user {} on {}:{}",
                profile.username, profile.host, profile.port
            ))
        }
    }

    /// Run a command, streaming complete output lines to `on_line`
    /// (stdout and stderr, flagged separately). Returns the exit code.
    pub async fn run_command<F>(
        &mut self,
        command: &str,
        timeout_secs: u64,
        mut on_line: F,
    ) -> Result<i64, String>
    where
        F: FnMut(&str, bool),
    {
        let mut channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open SSH channel: {e}"))?;
        channel
            .exec(true, command.as_bytes().to_vec())
            .await
            .map_err(|e| format!("Failed to start remote command: {e}"))?;

        let mut stdout_buffer: Vec<u8> = Vec::new();
        let mut stderr_buffer: Vec<u8> = Vec::new();
        let mut exit_code: Option<i64> = None;

        let wait = async {
            while let Some(msg) = channel.wait().await {
                match msg {
                    russh::ChannelMsg::Data { data } => {
                        emit_lines(&data, &mut stdout_buffer, false, &mut on_line);
                    }
                    russh::ChannelMsg::ExtendedData { data, .. } => {
                        emit_lines(&data, &mut stderr_buffer, true, &mut on_line);
                    }
                    russh::ChannelMsg::ExitStatus { exit_status } => {
                        exit_code = Some(exit_status as i64);
                    }
                    russh::ChannelMsg::Eof => {}
                    russh::ChannelMsg::Close => break,
                    _ => {}
                }
            }
        };
        tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), wait)
            .await
            .map_err(|_| format!("Remote command timed out after {timeout_secs}s"))?;

        // Flush any trailing partial line.
        if !stdout_buffer.is_empty() {
            let line = String::from_utf8_lossy(&stdout_buffer).into_owned();
            on_line(&line, false);
        }
        if !stderr_buffer.is_empty() {
            let line = String::from_utf8_lossy(&stderr_buffer).into_owned();
            on_line(&line, true);
        }

        Ok(exit_code.unwrap_or(-1))
    }

    /// Open an SFTP client session over this SSH connection.
    pub async fn open_sftp(&mut self) -> Result<SftpSession, String> {
        let channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open SFTP channel: {e}"))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| format!("Failed to request SFTP subsystem: {e}"))?;
        SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("Failed to start SFTP session: {e}"))
    }

    pub async fn disconnect(mut self) {
        let _ = self
            .handle
            .disconnect(russh::Disconnect::ByApplication, "done", "en")
            .await;
    }
}

/// Split a raw stdout/stderr chunk into complete lines and forward them.
fn emit_lines<F: FnMut(&str, bool)>(chunk: &[u8], buffer: &mut Vec<u8>, is_stderr: bool, on_line: &mut F) {
    buffer.extend_from_slice(chunk);
    while let Some(pos) = buffer.iter().position(|b| *b == b'\n') {
        let mut line: Vec<u8> = buffer.drain(..=pos).collect();
        line.pop(); // \n
        if line.last() == Some(&b'\r') {
            line.pop();
        }
        let text = String::from_utf8_lossy(&line).into_owned();
        on_line(&text, is_stderr);
    }
}

/// Upload bytes to a remote path over SFTP and optionally set permissions.
pub async fn sftp_upload(
    session: &mut SshSession,
    remote_path: &str,
    content: &[u8],
    permissions: Option<&str>,
) -> Result<(), String> {
    let mut sftp = session.open_sftp().await?;
    let upload = async {
        let mut file = sftp
            .create(remote_path)
            .await
            .map_err(|e| format!("Failed to open remote file {remote_path}: {e}"))?;
        file.write_all(content)
            .await
            .map_err(|e| format!("Failed to write remote file {remote_path}: {e}"))?;
        file.flush()
            .await
            .map_err(|e| format!("Failed to flush remote file {remote_path}: {e}"))?;
        file.close()
            .await
            .map_err(|e| format!("Failed to close remote file {remote_path}: {e}"))?;
        if let Some(mode) = permissions {
            let parsed = u32::from_str_radix(mode.trim(), 8)
                .map_err(|_| format!("Invalid permissions value: {mode}"))?;
            let attrs = russh_sftp::protocol::FileAttributes {
                permissions: Some(parsed),
                ..Default::default()
            };
            sftp.set_metadata(remote_path, attrs)
                .await
                .map_err(|e| format!("Failed to set permissions on {remote_path}: {e}"))?;
        }
        Ok(())
    };
    tokio::time::timeout(
        std::time::Duration::from_secs(SSH_TRANSFER_TIMEOUT_SECS),
        upload,
    )
    .await
    .map_err(|_| "SFTP upload timed out".to_string())?
}

/// Download a remote file over SFTP.
pub async fn sftp_download(
    session: &mut SshSession,
    remote_path: &str,
) -> Result<Vec<u8>, String> {
    let mut sftp = session.open_sftp().await?;
    let download = async {
        let mut file = sftp
            .open(remote_path)
            .await
            .map_err(|e| format!("Failed to open remote file {remote_path}: {e}"))?;
        let mut content = Vec::new();
        file.read_to_end(&mut content)
            .await
            .map_err(|e| format!("Failed to read remote file {remote_path}: {e}"))?;
        file.close()
            .await
            .map_err(|e| format!("Failed to close remote file {remote_path}: {e}"))?;
        Ok(content)
    };
    tokio::time::timeout(
        std::time::Duration::from_secs(SSH_TRANSFER_TIMEOUT_SECS),
        download,
    )
    .await
    .map_err(|_| "SFTP download timed out".to_string())?
}

/// Reject obviously invalid remote paths before they reach SFTP.
pub fn validate_remote_path(path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Remote path is required".to_string());
    }
    if trimmed.chars().any(|c| c == '\0') {
        return Err("Remote path contains invalid characters".to_string());
    }
    let absolute = trimmed.starts_with('/')
        || trimmed.starts_with('~')
        || trimmed
            .get(1..2)
            .map(|c| {
                c == ":"
                    && trimmed
                        .get(2..3)
                        .map(|s| s == "\\" || s == "/")
                        .unwrap_or(false)
            })
            .unwrap_or(false);
    if !absolute {
        return Err(format!(
            "Remote path must be absolute: {trimmed}"
        ));
    }
    Ok(())
}
