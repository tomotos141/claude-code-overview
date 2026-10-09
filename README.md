# claude-code-overview

A pane for Claude Code that keeps the current task in view: the Linear issue that tracks it, if there is one, then **the problem it solves, what it is for, what "done" means, what branched off, and what comes next**, and whether the session can be closed. Claude writes it as the work moves, so a long session never loses its thread.

```
Linear issue
  ABC-123
  https://linear.app/acme/issue/ABC-123

Problem
  New staff can't tell which setup steps are left

Goal
  New staff finish their setup on day one without asking around

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
  ✗ Keep it open
  waiting for the team's review

  Updated 14:32
```

[日本語の説明はこちら](#日本語)

## How it works

- The plugin gives Claude one tool, `update`. Claude calls it when a task is agreed (the Linear issue if any, the problem, the goal, the criteria, the next step), when a completion criterion is met, when a follow-up branches off, when the next step changes, and when whether the session can be closed changes.
- The goal is why the work is done — what solving the problem achieves — not the deliverable (that goes in "Done when") and not the problem said again.
- The Linear issue is optional: it shows first, only when the task has one, as its identifier (`ABC-123`) with its link on the next line when Claude has one.
- **Session** says whether you can close the session now without losing anything (✓ safe to close / ✗ keep it open) and why. Claude judges it: work that would be lost (uncommitted or unpushed changes), something still running, or a reply or approval still awaited keep it open; with none of those — including work that changed nothing — it is safe to close. It shows once Claude has judged it. When a finished task is cleared, it stays if Claude sends it along, as it is told to, and a "keep it open" stays even if Claude forgets. A "safe to close" disappears as soon as the work moves on, so a stale one never lingers.
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

Then start a new session. The pane opens when the session starts (Claude Code decides where it sits); if you don't see it, type `/overview`.

## Settings

| Setting | Values | Default |
| --- | --- | --- |
| `language` | `en`, `ja` | `en` |

It sets the language of the pane's own headings. Claude writes the contents in whatever language you use with it. Set it when installing with `--config language=ja`, or later with `/plugin configure overview@claude-code-overview`; it takes effect in the next session.

## Tips

- If the pane falls behind, just ask Claude to update it.
- Claude is asked to clear the pane when a task is over: it then shows only the Goal heading with its placeholder line, plus the Session section when Claude sends it along (as it is told to). If the task itself is still shown, ask it to.

## License

MIT

---

## 日本語

Claude Code に「いまの作業」を出すペインです。追跡している Linear issue（あれば）と、**解きたい課題・何のための作業か・どうなれば終わりか・途中で分かれた別件・次の一手**、いまセッションを閉じてよいかを、作業が進むたびに Claude が書き換えます。長いセッションでも、いまどこにいるかを見失いません。

### しくみ

- Claude に `update` というツールを1つ渡します。作業が決まったとき（あれば Linear issue と、課題・目的・完了条件・次の一手）、完了条件を1つ満たしたとき、別件が分かれたとき、次の一手が変わったとき、閉じてよいかが変わったときに、Claude がこれを呼びます。
- 目的は「何のための作業か」、つまり課題が解けた先で得たいことです。作るもの（完了条件に書きます）や、課題の言い換えは書きません。
- Linear issue は、作業に紐づく issue があるときだけ、一番上に出ます。番号（`ABC-123`）を出し、Claude がリンクを知っていれば次の行に出します。
- **セッション** の欄は、いま閉じても何も失わないか（✓ 閉じてよい ／ ✗ まだ閉じない）と、その理由を出します。判断するのは Claude で、失われる変更（未コミット・未 push）、動いている処理、待っている返事や承認があれば「まだ閉じない」、どれもなければ（何も変えなかった作業も含めて）「閉じてよい」にします。Claude が判断してから出ます。終わった作業を空にするとき、Claude がこの欄を一緒に送れば残ります（そう指示してあります）。「まだ閉じない」は、送り忘れても残ります。「閉じてよい」は、そのあと作業が動いたら消えるので、古い「閉じてよい」が残ることはありません。
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

新しいセッションを開くと、ペインが開きます（どこに置かれるかは Claude Code が決めます）。見当たらないときは `/overview` と打ってください。

### 設定

`language` を `ja` にすると、次のセッションからペインの見出しが日本語（課題・目的・完了条件・派生・次の一手・セッション）になります。Linear issue は英語のままです。入れるときに `--config language=ja` を付けるか、あとから `/plugin configure overview@claude-code-overview` で変えられます。中身は、あなたが Claude と話している言葉で書かれます。

### コツ

- ペインの更新が遅れていたら、「ペインを更新して」と頼んでください。
- 作業が終わったら、Claude がペインを空にするよう指示してあります。空になると「目的」の見出しと案内の1行だけになり、Claude が一緒に送れば（そう指示してあります）「セッション」の欄も残ります。作業の中身が残っていたら、空にするよう頼んでください。

### ライセンス

MIT
