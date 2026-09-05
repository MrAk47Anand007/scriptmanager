use serde::Serialize;
use serde_json::Value;
use tauri::State;

/// Local-owner workspace model (migration completion plan decision D1):
/// the Tauri desktop app is single-user. Multi-user collaboration
/// (users, invitations, roles, sessions) is retired — mutations return a
/// typed retired-feature error and the UI renders a stable local-owner
/// state instead of crashing or pretending collaboration works.

#[derive(Debug, Serialize)]
pub struct WorkspaceRoleView {
    pub id: String,
    pub key: String,
    pub name: String,
    pub permissions: Vec<Value>,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceMemberView {
    pub id: String,
    pub status: String,
    pub user: Value,
    pub role: WorkspaceRoleView,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceAccessView {
    pub workspace: Value,
    pub members: Vec<WorkspaceMemberView>,
    pub roles: Vec<WorkspaceRoleView>,
    pub invitations: Vec<Value>,
    pub permissions: Vec<String>,
    pub sessions: Vec<Value>,
    pub audit: Vec<Value>,
}

pub fn local_owner_workspace_view() -> WorkspaceAccessView {
    let owner_role = WorkspaceRoleView {
        id: "role-owner".to_string(),
        key: "owner".to_string(),
        name: "Owner".to_string(),
        permissions: vec![Value::String("*".to_string())],
    };
    let viewer_role = WorkspaceRoleView {
        id: "role-viewer".to_string(),
        key: "viewer".to_string(),
        name: "Viewer".to_string(),
        permissions: vec![
            Value::String("script:read".to_string()),
            Value::String("workflow:read".to_string()),
        ],
    };
    WorkspaceAccessView {
        workspace: serde_json::json!({ "name": "Local workspace", "kind": "local-owner" }),
        members: vec![WorkspaceMemberView {
            id: "membership-local-admin".to_string(),
            status: "active".to_string(),
            user: serde_json::json!({
                "id": "local-admin",
                "name": "Local Admin",
                "email": "local@localhost",
            }),
            role: WorkspaceRoleView {
                id: owner_role.id.clone(),
                key: owner_role.key.clone(),
                name: owner_role.name.clone(),
                permissions: owner_role.permissions.clone(),
            },
        }],
        roles: vec![owner_role, viewer_role],
        invitations: vec![],
        permissions: vec!["*".to_string()],
        sessions: vec![],
        audit: vec![],
    }
}

#[tauri::command]
pub async fn list_workspace_access(
    _pool: State<'_, sqlx::SqlitePool>,
) -> Result<WorkspaceAccessView, String> {
    Ok(local_owner_workspace_view())
}

#[tauri::command]
pub async fn create_workspace_invitation() -> Result<Value, String> {
    Err("Workspace collaboration (invitations) is retired in the local desktop app".to_string())
}

#[tauri::command]
pub async fn revoke_workspace_grants() -> Result<Value, String> {
    Err("Workspace collaboration (grant revocation) is retired in the local desktop app".to_string())
}

#[tauri::command]
pub async fn create_workspace_role() -> Result<Value, String> {
    Err("Workspace collaboration (custom roles) is retired in the local desktop app".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_owner_model_has_single_active_member_and_no_invitations() {
        let view = local_owner_workspace_view();
        let json = serde_json::to_value(&view).unwrap();
        assert_eq!(json["members"].as_array().unwrap().len(), 1);
        assert_eq!(json["members"][0]["status"], "active");
        assert_eq!(json["invitations"].as_array().unwrap().len(), 0);
        assert_eq!(json["sessions"].as_array().unwrap().len(), 0);
        assert_eq!(json["workspace"]["kind"], "local-owner");
        assert!(json["roles"].as_array().unwrap().iter().any(|r| r["key"] == "owner"));
    }
}
