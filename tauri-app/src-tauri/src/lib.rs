use tauri::Manager;
mod db;
mod models;
mod commands;
mod terminal;
mod git_ops;
mod fs_ops;
mod execution;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(terminal::TerminalState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_db(&handle).await.expect("Failed to initialize database");
                handle.manage(pool);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_scripts,
            commands::create_script,
            commands::get_collections,
            commands::get_settings,
            terminal::create_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            git_ops::git_clone,
            git_ops::git_log,
            git_ops::git_status,
            fs_ops::start_folder_watch,
            fs_ops::atomic_write_file,
            fs_ops::read_file,
            execution::execute_api_request,
            execution::execute_js_script,
            execution::run_workflow_dag
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
