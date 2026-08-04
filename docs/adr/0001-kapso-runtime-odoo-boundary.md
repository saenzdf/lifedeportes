# Kapso runtime accesses Odoo through Functions

Kapso runtime agents use Kapso Functions with closed input schemas, and those Functions call the Odoo JSON-RPC/API boundary. MCP is not part of the Kapso runtime; it remains reserved for Cursor and other manual operations, audits, and tests so runtime permissions and inputs stay explicit and constrained.
