use tauri::Manager;
mod commands;
mod db;
mod error;
mod execution;
mod fs_ops;
mod git_ops;
mod models;
mod schema;
mod state;
mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(terminal::TerminalState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_db(&handle)
                    .await
                    .expect("Failed to initialize database");
                handle.manage(pool);

                let paths = state::AppPaths::resolve(&handle)
                    .expect("Failed to resolve app paths");
                handle.manage(execution::ExecutionState::new(paths.builds_dir));
            });
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_scripts,
            commands::create_script,
            commands::read_script,
            commands::save_script,
            commands::delete_script,
            commands::duplicate_script,
            commands::get_collections,
            commands::create_collection,
            commands::update_collection,
            commands::delete_collection,
            commands::move_script,
            commands::get_settings,
            commands::get_bootstrap_state,
            commands::list_tags,
            commands::add_tag,
            commands::remove_tag,
            commands::list_templates,
            commands::save_template,
            commands::delete_template,
            commands::subscribe_noop,
            commands::list_env,
            commands::save_env,
            commands::delete_env,
            commands::list_versions,
            commands::read_version,
            commands::list_builds,
            commands::read_build_output,
            terminal::create_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            execution::run_script,
            execution::cancel_run,
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
