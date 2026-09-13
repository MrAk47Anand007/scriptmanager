use tauri::Manager;
mod api_client;
mod approvals;
mod agents;
mod commands;
mod db;
mod error;
mod execution;
mod fs_ops;
mod gist;
mod git_ops;
mod http_service;
mod js_engine;
mod mcp;
mod models;
mod notifications;
mod openapi;
mod observability;
mod projects;
mod plugins;
mod remote_exec;
mod schema;
mod scheduler;
mod scan;
mod security;
mod settings;
mod state;
mod storage;
mod ssh_transport;
#[cfg(test)]
mod ssh_test_server;
mod terminal;
mod workflows;
mod workspace_access;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // MCP stdio mode: the binary doubles as an MCP server so Claude Desktop,
    // Codex, and any other MCP client can use saved workflows, scripts, and
    // API requests as tools. Never starts the GUI in this mode.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| mcp::MCP_FLAG_ALIASES.contains(&arg.as_str())) {
        let code = tauri::async_runtime::block_on(mcp::run_stdio_server());
        std::process::exit(code);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(terminal::TerminalState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_db(&handle)
                    .await
                    .expect("Failed to initialize database");
                scheduler::spawn(handle.clone(), pool.clone());
                http_service::spawn_webhook_startup(handle.clone(), pool.clone());
                handle.manage(pool);

                let paths = state::AppPaths::resolve(&handle)
                    .expect("Failed to resolve app paths");
                handle.manage(execution::ExecutionState::new(paths.builds_dir));
                security::init_key_dir(&handle)
                    .expect("Failed to initialize secret vault key");
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
            commands::regenerate_webhook,
            commands::regenerate_webhook_secret,
            commands::toggle_webhook_signature,
            commands::save_script,
            commands::delete_script,
            commands::duplicate_script,
            commands::get_collections,
            commands::create_collection,
            commands::open_folder,
            commands::inspect_folder,
            commands::inspect_collection_workspace,
            commands::manage_collection_python_env,
            commands::rescan_canonical_folder,
            commands::list_canonical_recovery_drafts,
            commands::save_canonical_recovery_draft,
            commands::discard_canonical_recovery_draft,
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
            execution::run_script_data_driven,
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
            fs_ops::reveal_path,
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
            workflows::resolve_workflow_approval,
            workflows::draft_workflow_from_prompt,
            workflows::diagnose_node_failure,
            workflows::list_workflow_triggers,
            workflows::save_workflow_trigger,
            workflows::delete_workflow_trigger,
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
            api_client::list_data_sets,
            api_client::export_collection_run_junit,
            api_client::export_collection_run_html,
            openapi::import_openapi,
            api_client::save_data_set,
            api_client::delete_data_set,
            http_service::list_mock_servers,
            http_service::save_mock_server,
            http_service::delete_mock_server,
            http_service::start_mock_server,
            http_service::stop_mock_server,
            http_service::mock_server_status,
            http_service::list_mock_requests,
            http_service::clear_mock_requests,
            http_service::start_webhook_listener,
            http_service::stop_webhook_listener,
            http_service::webhook_listener_status,
            http_service::rotate_workflow_webhook,
            api_client::list_api_assertions,
            api_client::save_api_assertions,
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
            remote_exec::list_audit_log,
            storage::list_storage_providers,
            storage::save_storage_provider,
            storage::delete_storage_provider,
            storage::test_storage_provider,
            storage::sync_collection,
            agents::list_agent_profiles,
            agents::create_agent_profile,
            agents::list_agent_runs,
            agents::read_agent_run,
            agents::discover_agent_providers,
            agents::run_agent,
            agents::interrupt_agent_run,
            agents::resume_agent_run,
            agents::terminate_agent_run,
            agents::set_agent_provider_path,
            agents::get_agent_provider_paths,
            mcp::get_mcp_status,
            mcp::install_mcp_config,
            plugins::list_plugins,
            plugins::update_plugin,
            plugins::remove_plugin,
            plugins::save_plugin,
            plugins::run_plugin,
            workspace_access::list_workspace_access,
            workspace_access::create_workspace_invitation,
            workspace_access::revoke_workspace_grants,
            workspace_access::create_workspace_role,
            scan::scan_pc_scripts,
            scan::import_scanned_scripts,
            scan::pick_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
