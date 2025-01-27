const vscode = require("vscode");
const path = require("path");
const child_process = require("child_process");

function showButton() {
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );
  statusBar.command = "open-repository-in-browser.openInBrowser";
  statusBar.text = "$(ports-open-browser-icon)";
  statusBar.tooltip = "Open repository in browser";
  statusBar.show();
}

function activate(context) {
  showButton();
  let disposable = vscode.commands.registerCommand(
    "open-repository-in-browser.openInBrowser",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;
        if (document.isUntitled) {
          openInBrowser(getRepoUrl());
        } else {
          openInBrowser(getRepoUrl(), document, editor);
        }
      } else {
        openInBrowser(getRepoUrl());
      }
    }
  );

  context.subscriptions.push(disposable);
}

function openInBrowser(repoUrl, document, editor) {
  if (!repoUrl) {
    vscode.window.showErrorMessage(
      "No remote URL found for the current workspace."
    );
    return;
  }

  let lineRange = "";
  if (editor && editor.selection.isEmpty === false) {
    const startLine = editor.selection.start.line + 1;
    const endLine = editor.selection.end.line + 1;
    lineRange = `?plain=1#L${startLine}-L${endLine}`;
  }

  let url = repoUrl;
  if (document) {
    const workspaceFolder = getWorkspaceFolder();
    const workspaceRoot = workspaceFolder.uri.fsPath;
    const relativePath = path.relative(workspaceRoot, document.fileName);
    url += `/${relativePath}`;
  }

  url += lineRange;
  vscode.env.openExternal(vscode.Uri.parse(url));
}

function getWorkspaceFolder() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0];
  }
  return undefined;
}

function getRepoUrl() {
  const workspaceFolder = getWorkspaceFolder();
  if (workspaceFolder) {
    const workspaceRoot = workspaceFolder.uri.fsPath;

    // tries getting the remote URL of the current branch - method1
    try {
      const output = child_process
        .execSync("git rev-parse --abbrev-ref --symbolic-full-name @{u}", {
          cwd: workspaceRoot,
        })
        .toString()
        .trim();
      const match = output.match(/^(.+)\/(.+)$/);
      if (match) {
        const remote = match[1];
        const branch = match[2];
        let remoteUrl = child_process
          .execSync(`git config --get remote.${remote}.url`, {
            cwd: workspaceRoot,
          })
          .toString()
          .trim();
        remoteUrl = cleanUrl(remoteUrl);
        return remoteUrl + "/blob/" + branch;
      }
    } catch (error) {
      // Ignore errors
    }

    // tries getting the remote URL of the current branch - method2
    try {
      const currentBranch = child_process
        .execSync("git symbolic-ref --short HEAD", {
          cwd: workspaceRoot,
          encoding: "utf8",
        })
        .toString()
        .trim();
      const remoteName = child_process
        .execSync(`git config branch.${currentBranch}.remote`, {
          cwd: workspaceRoot,
          encoding: "utf8",
        })
        .toString()
        .trim();

      if (!remoteName) {
        remoteName = child_process
          .execSync(
            `git for-each-ref --format='%(upstream:short)' refs/heads/${currentBranch}`,
            { cwd: workspaceRoot, encoding: "utf8" }
          )
          .toString()
          .trim();
      }

      if (!remoteName) {
        throw new Error("badly configured upstream");
      }

      // Get the remote URL
      let remoteUrl = child_process
        .execSync(`git remote get-url ${remoteName}`, {
          cwd: workspaceRoot,
          encoding: "utf8",
        })
        .toString()
        .trim();

      if (!remoteUrl) {
        throw new Error("badly configured upstream");
      }

      remoteUrl = cleanUrl(remoteUrl) + "/blob/" + currentBranch;
      return remoteUrl;
    } catch (error) {
      // Ignore errors
    }

    // tries getting the remote URL of the default branch
    try {
      const defaultBranch = child_process
        .execSync("git symbolic-ref refs/remotes/origin/HEAD", {
          cwd: workspaceRoot,
          encoding: "utf8",
        })
        .toString()
        .trim()
        .replace("refs/remotes/origin/", "");
      let remoteUrl = child_process
        .execSync(`git config --get remote.origin.url`, {
          cwd: workspaceRoot,
          encoding: "utf8",
        })
        .toString()
        .trim();
      remoteUrl = cleanUrl(remoteUrl) + "/blob/" + defaultBranch;
      return remoteUrl;
    } catch (error) {
      // Ignore errors
    }

    // tries getting the remote URL of the current branch - method2
    try {
      const currentBranch = child_process
        .execSync("git symbolic-ref --short HEAD", {
          cwd: workspaceRoot,
          encoding: "utf8",
        })
        .toString()
        .trim();

      // Get the remote URL from 'origin' as the last try
      let remoteUrl = child_process
        .execSync(`git ls-remote --get-url origin`, {
          cwd: workspaceRoot,
          encoding: "utf8",
        })
        .toString()
        .trim();

      if (!remoteUrl) {
        throw new Error("badly configured upstream");
      }

      remoteUrl = cleanUrl(remoteUrl) + "/blob/" + currentBranch;
      return remoteUrl;
    } catch (error) {
      // Ignore errors
    }
  }

  return undefined;
}

function cleanUrl(url) {
  url = url.replace(/\.git$/, "");
  if (url.startsWith("git@")) {
    const [hostAndUser, repo] = url.replace("git@", "").split(":");
    const [host, _] = hostAndUser.split("+");
    url = `https://${host}/${repo}`;
  }
  return url;
}

exports.activate = activate;
