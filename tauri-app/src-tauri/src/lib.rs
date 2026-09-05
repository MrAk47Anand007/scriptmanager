use tauri::Manager;
mod api_client;
mod approvals;
mod commands;
mod db;
mod error;
mod execution;
mod fs_ops;
mod gist;
mod git_ops;
mod models;
mod notifications;
mod observability;
mod projects;
mod remote_exec;
mod schema;
mod scheduler;
mod security;
mod settings;
mod state;
mod terminal;
mod workflows;

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
                scheduler::spawn(handle.clone(), pool.clone());
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
            terminal::close_terminal,
            terminal::set_terminal_context,
            terminal::run_script_in_terminal,
            execution::run_script,
            execution::cancel_run,
            git_ops::git_clone,
            git_ops::git_log,
            git_ops::git_status,
            git_ops::run_git_action,
            git_ops::git_probe,
            git_ops::git_clone_project,
            projects::list_projects,
            projects::save_project,
            projects::delete_project,
            projects::assign_collection_to_project,
            fs_ops::start_folder_watch,
            fs_ops::atomic_write_file,
            fs_ops::read_file,
            execution::execute_api_request,
            execution::execute_js_script,
            workflows::list_workflows,
            workflows::create_workflow,
            workflows::save_workflow,
            workflows::publish_workflow,
            workflows::run_workflow,
            workflows::list_workflow_runs,
            workflows::read_workflow_run,
            workflows::retry_workflow_node,
            workflows::cancel_workflow_run,
            api_client::list_api_collections,
            api_client::save_api_collection,
            api_client::delete_api_collection,
            api_client::list_api_requests,
            api_client::save_api_request,
            api_client::delete_api_request,
            api_client::list_api_environments,
            api_client::save_api_environment,
            api_client::delete_api_environment,
            api_client::read_api_globals,
            api_client::save_api_globals,
            api_client::send_api_request,
            api_client::list_api_history,
            api_client::clear_api_history,
            api_client::run_api_collection,
            api_client::list_api_collection_runs,
            settings::read_settings,
            settings::save_settings,
            settings::read_github_gist_settings,
            settings::save_github_gist_settings,
            settings::clear_github_gist_settings,
            settings::export_scripts,
            settings::export_script,
            settings::import_scripts,
            security::list_secrets,
            security::create_secret,
            security::rotate_secret,
            security::disable_secret,
            security::reveal_secret,
            scheduler::read_schedule,
            scheduler::save_schedule,
            scheduler::delete_schedule,
            gist::sync_gist,
            gist::delete_gist,
            observability::get_observability_dashboard,
            observability::get_observability_run_detail,
            observability::read_observability_log,
            observability::cancel_observability_run,
            observability::retry_observability_run,
            approvals::list_approvals,
            approvals::decide_approval,
            notifications::list_notification_channels,
            notifications::create_notification_channel,
            notifications::list_notification_rules,
            notifications::create_notification_rule,
            notifications::list_notification_deliveries,
            remote_exec::list_server_profiles,
            remote_exec::save_server_profile,
            remote_exec::delete_server_profile,
            remote_exec::test_server_profile_connection,
            remote_exec::transfer_remote_script,
            remote_exec::start_remote_execution,
            remote_exec::approve_remote_execution,
            remote_exec::reject_remote_execution,
            remote_exec::list_audit_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
