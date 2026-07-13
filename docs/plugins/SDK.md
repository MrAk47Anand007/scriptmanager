# ScriptManager Plugin SDK

ScriptManager plugins are local packages with a version-1 manifest and a runtime implementing the contracts exported by `sdk/plugin`. Create a starter with `npm run plugin:create -- ./my-plugin com.example.my-plugin`.

## Trust and signatures

Install, trust, and enable are separate operations. Signed packages may include an Ed25519 public key and base64 signature. Unsigned packages install only when the user explicitly selects local-development opt-in; the UI keeps that state visible. Disabling or uninstalling is workspace-scoped.

## Capabilities and settings

Declare only required capabilities: `http:request`, `events:emit`, `vault:reference`, `storage:access`, `notifications:send`, or `desktop:request`. Every host call checks the declaration and initiating user's `plugin:run` permission. Secret settings store opaque `secret://...` references; no SDK API resolves plaintext. Settings use a small JSON object schema and reject unknown fields when `additionalProperties` is false.

## Workflow nodes and lifecycle

Node types become `plugin:<plugin-id>:<node-type>`. The runtime receives config, input, and a restricted host. Supported hooks are `activate`, `deactivate`, and `healthCheck`. Health and optional `updateUrl` metadata appear in Settings → Plugins.

Plugins must not import Prisma, Electron internals, application database modules, or secret-store implementations. See `examples/plugins/workflow-node` and `examples/plugins/notification`.
