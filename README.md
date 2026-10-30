# Cope's prompts (private)

The text behind every prompt marker Cope's clients send (`{{cope:<id>}}`), kept out of the code repository so the code can be published without them. Never publish this repository. Its `origin` is a private GitHub repository, its only copy off the owner's machine (the server's backups leave it out): push after each commit.

- `default/<path>.md`: the body of the battery file `packages/battery-default/batteries/default/<path>.md` (its front matter and the rest of the battery stay in the code repository).
- `core/<id>.md`: the text of core's `instruction('<id>')`, as sent (the file's last newline left out).

Who reads it: Cope's server at start (`COPE_SERVER_PROMPTS`, else `COPE_PROMPTS`, else this folder when it sits beside the code repository as `../cope-prompts`); `pnpm server --watch-prompts` reloads it on every change. The workbench (`pnpm workbench`) edits it, and `pnpm check:prompts` fails when any of its text turns up in the code repository. `pnpm deploy:server` copies it to the server.

A new prompt: add its marker or `instruction('<id>')` in the code, rebuild the battery bundle, and add its file here; the server refuses to start while a prompt the clients send has no file.
