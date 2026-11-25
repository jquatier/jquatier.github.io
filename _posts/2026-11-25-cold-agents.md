---
layout: post
title:  "Cold Agents - Testing a Tool by Handing It to a Stranger"
date:   2026-11-25 11:00:00 -0800
summary: "Unit tests tell you the code works. They don't tell you whether someone who's never seen it can use it. When your user is an AI agent, you can hire that stranger over and over. Here's how I test Squinch that way, and what it's caught..."
---
When I wrote about the [new layout engine](/squinch-layout-engine/), one line in the testing section got more questions than anything else: "Thirty-nine prompts each go to an AI agent that has only the Squinch skill and the CLI." So here's the longer version.

Squinch has a pile of ordinary tests, and they're good at telling me the code does what I meant. What they can't tell me is whether somebody who has never seen the code can sit down with the docs and get a good diagram out of it. Usually you find that out from your users, a few at a time, months later.

But [Squinch](https://squinch.cc)'s main user is an AI agent, and you can hire a new one of those whenever you want. It shows up knowing nothing, reads exactly what you give it, and tries. So I do that, 42 times in a row, and call it the gauntlet.

### What a cold agent gets

Each prompt gets its own box with three things in it:

- the skill (`SKILL.md` and its reference files, exactly as `squinch skill` installs them)
- `PROMPT.md`, the request
- a `squinch` binary

That's it. A fresh `claude -p` session starts in that box with no memory, no examples and no access to the repo. Some prompts are tidy:

> Order events flow through EventBridge to two consumers: an email notifier (Lambda plus SNS) and an analytics writer (Lambda plus an S3 data lake). Failed events land in an SQS dead-letter queue. Show asynchronous flows as async.

And some are written the way people actually talk:

> OK so this is our thing. Customers come in through the mobile app or the website, does not really matter, both hit the same gateway. [...] Billing reads from Postgres too. Actually no, scratch that, billing has its own database, separate one. Do not bother with the internal admin tool, nobody cares about it.

One of them hands the agent a real open source repo, pinned to a commit, and asks it to diagram what the code actually does.

### Keep the answers out of reach

The committed answers live in the repo, so the first thing a sandbox has to do is keep a curious agent away from them. That shaped more of the harness than I expected.

My first instinct was to put a tiny script on the PATH that called the CLI in the repo. The problem is that the script prints a repo path, and two `cd ..`s from there is the folder of answers. So the CLI gets bundled into a single file and copied into the box instead. Bundling it turned up its own bug: the CLI read its version from a `package.json` that wasn't there anymore once bundled. Nothing in CI bundles the CLI, so only the gauntlet could have caught that one.

The `squinch` in the box isn't the real CLI either. It's a wrapper that logs every call, with its arguments, exit code and output, to a file *outside* the box. That way the number of attempts comes from the harness, not from asking the agent how it went.

I can't fully stop an agent with a shell from reading outside its folder, short of building a real OS sandbox. So I measure it instead. Every tool call gets scanned for paths that escape the box, and if one does, that prompt's answer gets thrown out. That happened to one prompt in the latest round.

(Also: never start a round with uncommitted work. Those agents are running shell commands as you while you go get coffee.)

### Count the attempts, not the passes

A pass/fail score is the least useful thing a round produces. What I really watch is **how many times the agent ran `squinch check`**.

One call, clean exit, no warnings means the skill carried that prompt all by itself. Anything more means the agent hit something, and the first message it hit is the interesting part. Either the skill didn't explain something, or the error message didn't say how to fix it, or the engine had a bug. Every round's findings get fixed in the same commit as the round itself.

The gauntlet's README says it better than I can: a run that scores full marks and finds a crash is a better run than one that scores full marks and finds nothing.

### What it's found

Thirty-nine rounds since July. These are the ones that changed how I think about it.

**Agents agree on the same "wrong" syntax.** In one probe, five out of five fresh agents, Sonnet and Haiku alike, wrote a tag where the kind goes:

{% highlight kotlin %}
charge = aws/lambda "Charge Handler" #pci { ... }
{% endhighlight %}

That wasn't legal. Commas were the same story: required in some places and forbidden in others, so agents and I got them wrong in both directions. When every new reader writes it the same way, the language is the thing that's wrong. Both are legal now.

**One mistake should be one error.** An agent declared nine boxes inside a system, referred to them from outside without the system's prefix, and got back twenty-eight `unknown id` errors. Every one was correct, and together they buried the single thing worth saying. Now three or more errors with the same cause fold into one message that says what that cause is.

**The checker can't know what you meant.** A prompt asked for CloudFront and the agent used the Cloudflare logo. It's a valid icon and the check came back clean, but it's a different company. No checker catches that. The skill now says to search for specific products and lists the confusing pairs.

**Agents don't read the appendix.** I moved the long reference sections out of the skill into separate files to keep the main doc short. The next round, not one of fifty sessions opened any of those files. The icon lists went right back in. The cookbook stayed out, because the error messages already carry their own fixes.

**Sometimes the prompt is the bug.** One prompt failed round after round. I rewrote a section of the skill to fix it, then ran it three times: no passes. Then I added one sentence to the *prompt*, in plain words the way a user would say it ("an overview page that fits on one screen, and then a page for each part of the system"). Three passes out of three, with or without the skill change. The skill change didn't stay.

**Sometimes the agent is right and you're wrong.** I added an error message that printed a ready-to-paste fix for a layout conflict. Agents were offered it three times in the next round and turned it down all three times. Reading the transcript, they were right. The fix would have quietly dropped half of what the user asked for, so the agent went looking for something that kept both halves.

**It tells you what to delete, too.** I'd built a pre-parser that caught other diagram languages' spellings (UML, Mermaid) and turned each one into a single clear error, just in case agents reached for them. Once the skill taught the real syntax, zero out of forty agents wrote any of them. So it came out.

### Keep the prompts hard

After eleven rounds of tuning, the original twenty prompts hit the ceiling two rounds running. Everything those rounds found came from the harness and nothing from the prompts, which meant the prompts had stopped testing anything. Nine new ones went in, including one that asks for two things that can't both be true, on purpose. Four of the nine needed a second try right away.

The flip side is only scoring what the prompt actually asks for. One prompt's scoring required a shared trunk line that the prompt never asked for. It came out, because it was grading the agent on my taste instead of its work.

### Two halves: one costs money, one is free

Running a round costs real money and the results aren't deterministic, so it's never part of CI. The harness keeps the *conditions* the same every time, not the outcome.

The answers from the last round I reviewed are committed, and a scorer with no model and no network runs over them on every push. It builds every answer, renders every view, checks the SVG, and makes sure each answer still has what its prompt asked for. If I change the engine and an answer some past agent wrote breaks, CI says so.

The latest round scored 41 out of 42, and 30 of the 42 got there on the first `check`. The one miss was a modeling call (a nightly sync job drawn as an arrow instead of a box), not the tool.

### Tips for testing with cold agents

If you're building something for agents to use, here's what I'd pass on:

1. **Give it only what a real user gets.** If the agent can see your repo, you're testing your repo and not your docs.
2. **Log from the outside.** Count attempts in the harness, not by asking the agent how it went.
3. **Measure the struggle, not the score.** Every extra attempt points at a doc or an error message to fix.
4. **Read the transcripts.** The number tells you something went wrong. The transcript tells you whether it was the agent, the tool, or your test.
5. **When they all make the same mistake, it's not a mistake.** Change the tool to match.
6. **Keep the expensive part out of CI.** Commit the answers and score them for free on every push.

The whole setup is in the repo under [`gauntlet/`](https://github.com/jquatier/squinch/tree/main/gauntlet) if you want to borrow it, and you can try Squinch itself in the [playground](https://squinch.cc/playground/).

Enjoy! =)
