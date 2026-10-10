# claude-code-overview

A pane for Claude Code that keeps the current task in view. On top, a cover you read when you come back to the session: **the task's title, what comes next, how far it is, and whether the session can be closed**. Below a rule, the details: the Linear issue that tracks it, if there is one, the problem it solves, what it is for, what "done" means, and what branched off. Claude writes it as the work moves, so a long session never loses its thread.

```
Onboarding checklist
→ Ask the team to review the copy
██████████░░░░░░░░░░  2/4
✗ Keep it open — waiting for the team's review
────────────────────────────────────────
Linear issue
  ABC-123            (opens the issue)

Problem
  New staff can't tell which setup steps are left

Goal
  New staff finish their setup on day one without asking around

Done when  2/4
  ○ Copy reviewed by the team
  ○ Released to staging
  ✓ Checklist component built
  ✓ Tests pass

Side tasks
  • Fix the date picker bug (separate PR)

  Updated 14:32  [ ↻ ]
```

[日本語の説明はこちら](#日本語)

## How it works

- The plugin gives Claude one tool, `update`, and a line in its system prompt asking it to fill the pane as soon as you bring a task, the first request of the session included, without being asked. The line is added only where the pane is shown: not in a `claude -p` run, a teammate, or `--bare`. Only the main conversation writes the pane; a subagent's call leaves it as it is. Claude calls it when a task is agreed (a short title, the Linear issue if any, the problem, the goal, the criteria, the next step), when a completion criterion is met, when a follow-up branches off, when the next step changes, and when whether the session can be closed changes.
- The goal is why the work is done — what solving the problem achieves — not the deliverable (that goes in "Done when") and not the problem said again.
- The title is a few words naming the task, like a ticket title. It heads the pane because a session's own name is set when it starts and does not follow the work.
- The Linear issue is optional: it shows first among the details, only when the task has one, as its identifier (`ABC-123`), which opens the issue when Claude has its link.
- The cover's last line says whether you can close the session now without losing anything (✓ safe to close / ✗ keep it open) and why. The desktop app names it after archiving, the step you take there (✓ safe to archive / ✗ do not archive yet). Claude judges it: work that would be lost (uncommitted or unpushed changes), something still running, or a reply or approval still awaited keep it open; with none of those — including work that changed nothing — it is safe to close. It shows once Claude has judged it. When a finished task is cleared, it stays if Claude sends it along, as it is told to, and a "keep it open" stays even if Claude forgets. A "safe to close" disappears as soon as the work moves on, so a stale one never lingers.
- The **↻** button beside the updated time asks Claude to bring the pane up to date with where the work stands, for when the conversation has moved on past it. Pressed again before Claude has answered, a button asks nothing more. In the desktop app, each side task has a **↗** button in front of it that asks Claude to spin it off as a task chip; press the chip to start that session.
- What a task still lacks stands out: an empty title, problem, goal, completion criteria or next step is marked `!` in the theme's warning color, and a line at the top names them all ("Still missing: Title / Next step"). Claude leaves out what it cannot tell from your request rather than guess, so the marks show what to tell it.
- A bar on the cover shows how far the criteria are done: drawn as an image in the desktop app, the editor and the phone, and in block characters in the terminal. It is full only when every criterion is done.
- Open items are listed first; finished ones are dimmed with a check. Lists are capped at 12 items and lines at 160 characters (the issue's link is kept whole, up to 2048 characters), so the pane stays a glance.
- The plugin makes no network requests of its own. What Claude writes to the pane is part of the conversation, like any tool call, so treat it as you would anything else you tell Claude.

## Requirements

A Claude Code build that supports plugin hook modules ("mods"). Developed against Claude Code 2.1.282 and later.

## Install

```bash
claude plugin marketplace add https://github.com/tomotos141/claude-code-overview
```

```bash
claude plugin install overview@claude-code-overview
```

For Japanese headings, add `--config language=ja` to the install command.

Then start a new session. The pane opens when the session starts, in the terminal and in the desktop app alike (Claude Code decides where it sits; a terminal narrower than 144 columns holds it back until it widens); if you don't see it, type `/overview`. Once you close it, it is not opened for you again until the plugin reloads (a new session, or a setting changed in `/config`).

## Settings

| Setting | Values | Default |
| --- | --- | --- |
| `language` | `en`, `ja` | `en` |

It sets the language of the pane's own headings. Claude writes the contents in whatever language you use with it. Set it when installing with `--config language=ja`, or later with `/plugin configure overview@claude-code-overview`; it takes effect in the next session.

## Tips

- If the pane falls behind, just ask Claude to update it.
- Claude is asked to clear the pane when a task is over: it then shows only the Goal heading with its placeholder line, plus the Session section when Claude sends it along (as it is told to) or a "keep it open" was already shown. If the task itself is still shown, ask it to.

## License

MIT

---

## 日本語

Claude Code に、いまの作業の全体像を出す「Session overview」ペインです。一番上は、セッションに戻ってきたときに読む表紙で、**作業の題名・次にやること・どこまで進んだか・いまセッションを閉じてよいか** を出します。線の下は中身で、追跡している Linear issue（あれば）、解きたい課題、何のための作業か、どうなれば終わりか、途中で分かれた別件を出します。作業が進むたびに Claude が書き換えます。長いセッションでも、いまどこにいるかを見失いません。

### しくみ

- Claude に `update` というツールを1つ渡し、システムプロンプトに「作業を頼まれたら（セッション最初の依頼も含めて）、頼まれなくても先にペインを埋める」という一文を足します。この一文はペインが見える場面だけに足し、`claude -p` の実行・teammate・`--bare` には足しません。ペインに書けるのはメインの会話だけで、subagent からの呼び出しではペインは変わりません。作業が決まったとき（短い題名、あれば Linear issue、課題・目的・完了条件・次にやること）、完了条件を1つ満たしたとき、別件が分かれたとき、次にやることが変わったとき、閉じてよいかが変わったときに、Claude がこれを呼びます。
- 目的は「何のための作業か」、つまり課題が解けた先で得たいことです。作るもの（完了条件に書きます）や、課題の言い換えは書きません。
- 題名は、作業を数語で表したものです（チケットの件名のようなもの）。セッション自体の名前は始めたときに付いたまま作業についてこないので、ペインの一番上に題名を置いています。
- Linear issue は、作業に紐づく issue があるときだけ、中身の一番上に出ます。番号（`ABC-123`）を出し、Claude がリンクを知っていれば、番号を押すと issue が開きます。
- 表紙の最後の行は、いま閉じても何も失わないか（✓ 閉じてよい ／ ✗ まだ閉じない）と、その理由を出します。デスクトップアプリでは、そこでの操作に合わせて「✓ アーカイブしてよい ／ ✗ まだアーカイブしない」と出します。判断するのは Claude で、失われる変更（未コミット・未 push）、動いている処理、待っている返事や承認があれば「まだ閉じない」、どれもなければ（何も変えなかった作業も含めて）「閉じてよい」にします。Claude が判断してから出ます。終わった作業を空にするとき、Claude がこの欄を一緒に送れば残ります（そう指示してあります）。「まだ閉じない」は、送り忘れても残ります。「閉じてよい」は、そのあと作業が動いたら消えるので、古い「閉じてよい」が残ることはありません。
- 更新時刻の横の **↻** ボタンを押すと、Claude がペインをいまの作業の状況に合わせて書き直します。会話が進んでペインが古くなったときに使います。Claude が答え終わるまでは、もう一度押しても重ねて頼みません。デスクトップアプリでは、別件の前に **↗** ボタンが出ます。押すと Claude がその別件をタスクチップとして切り出すので、チップを押せば新しいセッションが始まります。
- 作業に足りない情報は目立たせます。題名・課題・目的・完了条件・次にやることのうち空いているものには、テーマの警告色で `!` を付け、一番上の行にまとめて出します（「まだ足りない: 題名 / 次にやること」）。Claude は依頼から読み取れないことを推測で埋めずに空けておくので、この印を見れば何を伝えればよいかがわかります。
- 表紙に、どこまで済んだかを示すバーが出ます。デスクトップアプリ・エディタ・スマートフォンでは図として、ターミナルでは文字で描きます。満タンになるのは、完了条件がすべて済んだときだけです。
- 残っている完了条件が上に、済んだものは ✓ 付きの薄い文字で下に並びます。一覧は12件、1行は160字までで切るので（issue のリンクは2048字まで切りません）、ひと目で読める大きさに収まります。
- plugin 自身は外部と通信しません。ただし Claude がペインに書く内容は、ほかのツール呼び出しと同じく会話の一部として扱われます。Claude に話してよい範囲の内容にしてください。

### 必要なもの

plugin の hook モジュール（mods）に対応した Claude Code。2.1.282 以降を対象に作っています。

### 入れ方

```bash
claude plugin marketplace add https://github.com/tomotos141/claude-code-overview
```

```bash
claude plugin install overview@claude-code-overview --config language=ja
```

見出しを英語にしたいときは `--config language=ja` を外してください。

新しいセッションを開くと、ターミナルでもデスクトップアプリでもペインが開きます（どこに置かれるかは Claude Code が決めます。ターミナルの幅が144桁より狭いときは、広がるまで待ちます）。見当たらないときは `/overview` と打ってください。一度閉じると、plugin が読み込み直されるまで（新しいセッションを開く、`/config` で設定を変える など）は自動では開きません。

### 設定

`language` を `ja` にすると、次のセッションからペインの見出しが日本語（題名・課題・目的・完了条件・別件・次にやること・セッション）になります。Linear issue は英語のままです。入れるときに `--config language=ja` を付けるか、あとから `/plugin configure overview@claude-code-overview` で変えられます。中身は、あなたが Claude と話している言葉で書かれます。

### コツ

- ペインの更新が遅れていたら、「ペインを更新して」と頼んでください。
- 作業が終わったら、Claude がペインを空にするよう指示してあります。空になると「目的」の見出しと案内の1行だけになり、Claude が一緒に送れば（そう指示してあります）、または「まだ閉じない」が出ていれば、「セッション」の欄も残ります。作業の中身が残っていたら、空にするよう頼んでください。

### ライセンス

MIT
