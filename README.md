# claude-code-overview

A pane for Claude Code that keeps the current task in view: **what it is for, what "done" means, what branched off, and what comes next.** Claude writes it as the work moves, so a long session never loses its thread.

```
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

  Updated 14:32
```

[日本語の説明はこちら](#日本語)

## How it works

- The plugin gives Claude one tool, `update`. Claude calls it when a task is agreed, when a completion criterion is met, when a follow-up branches off, and when the next step changes.
- Open items are listed first; finished ones are dimmed with a check. Lists are capped at 12 items and lines at 160 characters, so the pane stays a glance.
- Nothing leaves your machine. The pane holds its state for the session only; there are no external services.

## Requirements

A Claude Code build that supports plugin hook modules ("mods"). Tested on Claude Code 2.1.282 (CLI) and the desktop app's Code tab.

## Install

```bash
claude plugin marketplace add tomotos141/claude-code-overview
```

```bash
claude plugin install overview@claude-code-overview
```

Then start a new session. The pane opens on its own where the window has room; otherwise type `/overview`.

## Settings

| Setting | Values | Default |
| --- | --- | --- |
| `language` | `en`, `ja` | `en` |

It sets the language of the pane's own headings. Claude writes the contents in whatever language you use with it. Change it from `/config`.

## Tips

- If the pane falls behind, just ask Claude to update it.
- When a task is over, Claude clears the pane; the next task starts fresh.

## License

MIT

---

## 日本語

Claude Code の右側に「いまの作業」を出すペインです。**何のための作業か・どうなれば終わりか・途中で分かれた別件・次の一手** を、作業が進むたびに Claude が書き換えます。長いセッションでも、いまどこにいるかを見失いません。

### しくみ

- Claude に `update` というツールを1つ渡します。作業が決まったとき、完了条件を1つ満たしたとき、別件が分かれたとき、次の一手が変わったときに、Claude がこれを呼びます。
- 残っている完了条件が上に、済んだものは ✓ 付きの薄い文字で下に並びます。一覧は12件、1行は160字までで切るので、ひと目で読める大きさに収まります。
- 外部サービスには何も送りません。中身はそのセッションの中だけで持ちます。

### 必要なもの

plugin の hook モジュール（mods）に対応した Claude Code。CLI の 2.1.282 と、デスクトップアプリの Code タブで動作を確かめています。

### 入れ方

```bash
claude plugin marketplace add tomotos141/claude-code-overview
```

```bash
claude plugin install overview@claude-code-overview
```

新しいセッションを開くと、画面に余裕があればペインが自動で開きます。開かないときは `/overview` と打ってください。

### 設定

`/config` で `language` を `ja` にすると、ペインの見出しが日本語（目的・完了条件・派生・次の一手）になります。中身は、あなたが Claude と話している言葉で書かれます。

### コツ

- ペインの更新が遅れていたら、「ペインを更新して」と頼んでください。
- 作業が終わると Claude がペインを空にし、次の作業はまっさらから始まります。

### ライセンス

MIT
