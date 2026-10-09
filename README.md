# claude-code-overview

A pane for Claude Code that keeps the current task in view: **the problem it solves, what it is for, what "done" means, what branched off, and what comes next** — with the Linear issue that tracks it, if there is one, and whether the session is safe to close. Claude writes it as the work moves, so a long session never loses its thread.

```
Problem
  New staff can't tell which setup steps are left

Linear issue
  ABC-123  https://linear.app/acme/issue/ABC-123

Goal
  Ship the onboarding checklist

Done when  2/4
  ○ Copy reviewed by the team
  ○ Released to staging
  ✓ Checklist component built
  ✓ Tests pass

Offshoots
  • Fix the date picker bug (separate PR)

Next step
  → Ask the team to review the copy

Session
  ✗ Keep it open  waiting for the team's review

  Updated 14:32
```

[日本語の説明はこちら](#日本語)

## How it works

- The plugin gives Claude one tool, `update`. Claude calls it when a task is agreed (the problem, the goal, the criteria, the next step, and the Linear issue if any), when a completion criterion is met, when a follow-up branches off, when the next step changes, and when whether the session can be closed changes.
- The Linear issue is optional: it shows only when the task has one, as its identifier (`ABC-123`), with its link when Claude has one.
- **Session** says whether you can close the session now without losing anything (✓ safe to close / ✗ keep it open) and why — uncommitted or unpushed work, something still running, a reply still awaited. It shows once Claude has judged it.
- Open items are listed first; finished ones are dimmed with a check. Lists are capped at 12 items and lines at 160 characters, so the pane stays a glance.
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

Then start a new session. The pane opens when the session starts (Claude Code decides where it sits); if you don't see it, type `/overview`.

## Settings

| Setting | Values | Default |
| --- | --- | --- |
| `language` | `en`, `ja` | `en` |

It sets the language of the pane's own headings. Claude writes the contents in whatever language you use with it. Set it when installing with `--config language=ja`, or later with `/plugin configure overview@claude-code-overview`; it takes effect in the next session.

## Tips

- If the pane falls behind, just ask Claude to update it.
- Claude is asked to clear the pane when a task is over. If it doesn't, ask it to.

## License

MIT

---

## 日本語

Claude Code に「いまの作業」を出すペインです。**解きたい課題・何のための作業か・どうなれば終わりか・途中で分かれた別件・次の一手** と、追跡している Linear issue、いまセッションを閉じてよいかを、作業が進むたびに Claude が書き換えます。長いセッションでも、いまどこにいるかを見失いません。

### しくみ

- Claude に `update` というツールを1つ渡します。作業が決まったとき（課題・目的・完了条件・次の一手と、あれば Linear issue）、完了条件を1つ満たしたとき、別件が分かれたとき、次の一手が変わったとき、閉じてよいかが変わったときに、Claude がこれを呼びます。
- Linear issue は、作業に紐づく issue があるときだけ出ます。番号（`ABC-123`）を出し、Claude がリンクを知っていれば並べます。
- **セッション** の欄は、いま閉じても何も失わないか（✓ 閉じてよい ／ ✗ まだ閉じない）と、その理由を出します。未コミット・未 push の変更、動いている処理、待っている返事があれば「まだ閉じない」になります。Claude が判断してから出ます。
- 残っている完了条件が上に、済んだものは ✓ 付きの薄い文字で下に並びます。一覧は12件、1行は160字までで切るので、ひと目で読める大きさに収まります。
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

新しいセッションを開くと、ペインが開きます（どこに置かれるかは Claude Code が決めます）。見当たらないときは `/overview` と打ってください。

### 設定

`language` を `ja` にすると、次のセッションからペインの見出しが日本語（課題・目的・完了条件・派生・次の一手・セッション）になります。Linear issue は英語のままです。入れるときに `--config language=ja` を付けるか、あとから `/plugin configure overview@claude-code-overview` で変えられます。中身は、あなたが Claude と話している言葉で書かれます。

### コツ

- ペインの更新が遅れていたら、「ペインを更新して」と頼んでください。
- 作業が終わったら Claude がペインを空にするよう指示してあります。残っていたら、空にするよう頼んでください。

### ライセンス

MIT
