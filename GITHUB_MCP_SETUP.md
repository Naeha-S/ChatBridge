# GitHub MCP Server Setup Guide

This guide will help you connect the GitHub MCP server to ChatBridge to enable GitHub operations directly from the extension.

## What is GitHub MCP?

The GitHub Model Context Protocol (MCP) server allows ChatBridge to:
- Create, read, and manage GitHub repositories
- Create issues and pull requests
- Search code across repositories
- Fork repositories and manage branches
- Access commit history and file contents

## Prerequisites

1. **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
2. **GitHub Personal Access Token** - [Create one here](https://github.com/settings/tokens/new)
   - Required scopes: `repo`, `read:org`, `read:user`, `workflow`
3. **ChatBridge extension** installed and working

## Installation Steps

### 1. Install GitHub MCP Server

Open your terminal (PowerShell, Command Prompt, or Terminal) and run:

```bash
npm install -g @modelcontextprotocol/server-github
```

Or install it locally in your ChatBridge directory:

```bash
cd C:\Users\nehas\OneDrive\Desktop\ChatBridge
npm install @modelcontextprotocol/server-github
```

### 2. Create GitHub Personal Access Token

1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens/new)
2. Click "Generate new token (classic)"
3. Give it a descriptive name like "ChatBridge MCP"
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `read:org` (Read org and team membership)
   - ✅ `read:user` (Read user profile data)
   - ✅ `workflow` (Update GitHub Actions workflows)
5. Click "Generate token"
6. **Copy the token immediately** (you won't see it again!)

### 3. Configure Environment Variable

#### Windows (PowerShell):
```powershell
$env:GITHUB_PERSONAL_ACCESS_TOKEN = "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"
```

To make it permanent:
```powershell
[System.Environment]::SetEnvironmentVariable('GITHUB_PERSONAL_ACCESS_TOKEN', '$env:GITHUB_PERSONAL_ACCESS_TOKEN = "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"', 'User')
```

#### macOS/Linux:
```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"
```

Add to `~/.bashrc` or `~/.zshrc` to make permanent:
```bash
echo 'export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"' >> ~/.bashrc
source ~/.bashrc
```

### 4. Test the Server

Run the MCP server manually to test:

```bash
npx @modelcontextprotocol/server-github
```

You should see output like:
```
GitHub MCP Server running
Listening for MCP connections...
```

### 5. Connect to ChatBridge

#### Option A: Automatic Connection (Recommended)

ChatBridge will automatically detect and connect to the GitHub MCP server when:
1. The server is installed globally or locally
2. The `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable is set
3. You restart ChatBridge

#### Option B: Manual Configuration

If automatic connection doesn't work, add this to your ChatBridge manifest.json:

```json
{
  "mcp_servers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

### 6. Verify Connection

1. Open ChatBridge extension
2. Click "Agent Hub" tab
3. Look for "GitHub" in the connections list
4. Status should show "Connected" with a green dot

Or test in the browser console:
```javascript
// Test GitHub MCP connection
MCPBridge.sendRequest('/github', 'GET', { resource: 'user' })
  .then(data => console.log('GitHub user:', data))
  .catch(err => console.error('GitHub MCP error:', err));
```

## Usage Examples

Once connected, you can use GitHub operations through ChatBridge:

### Search repositories:
```javascript
MCPBridge.sendRequest('/github', 'QUERY', {
  action: 'search_repos',
  query: 'language:javascript stars:>1000'
});
```

### Create an issue:
```javascript
MCPBridge.sendRequest('/github', 'POST', {
  action: 'create_issue',
  owner: 'Naeha-S',
  repo: 'ChatBridge',
  title: 'New feature request',
  body: 'Description of the feature...'
});
```

### Get repository contents:
```javascript
MCPBridge.sendRequest('/github', 'GET', {
  action: 'get_contents',
  owner: 'Naeha-S',
  repo: 'ChatBridge',
  path: 'README.md'
});
```

## Troubleshooting

### "GitHub MCP server not found"
- Ensure you installed the server: `npm install -g @modelcontextprotocol/server-github`
- Check installation: `npm list -g @modelcontextprotocol/server-github`

### "Authentication failed"
- Verify your token is set: `echo $env:GITHUB_PERSONAL_ACCESS_TOKEN` (Windows) or `echo $GITHUB_PERSONAL_ACCESS_TOKEN` (Mac/Linux)
- Check token has correct scopes in GitHub settings
- Try generating a new token

### "Connection timeout"
- Check if Node.js is installed: `node --version`
- Try running the server manually to see error messages
- Check firewall isn't blocking Node.js

### Server crashes on startup
- Update Node.js to the latest LTS version
- Clear npm cache: `npm cache clean --force`
- Reinstall the server: `npm uninstall -g @modelcontextprotocol/server-github && npm install -g @modelcontextprotocol/server-github`

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit your token to git** - Add `.env` to `.gitignore`
2. **Use environment variables** - Don't hardcode tokens in source files
3. **Limit token scopes** - Only grant necessary permissions
4. **Rotate tokens regularly** - Generate new tokens every few months
5. **Use fine-grained tokens** - Consider using [fine-grained personal access tokens](https://github.com/settings/tokens?type=beta) for better security

## Additional Resources

- [GitHub MCP Server Documentation](https://github.com/modelcontextprotocol/server-github)
- [GitHub API Documentation](https://docs.github.com/en/rest)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [ChatBridge Developer Guide](./documentation/DEVELOPER_GUIDE.md)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the [GitHub MCP Issues](https://github.com/modelcontextprotocol/server-github/issues)
3. Open an issue in the [ChatBridge repository](https://github.com/Naeha-S/ChatBridge/issues)
