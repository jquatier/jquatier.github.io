---
layout: post
title:  "Cold Agents - Testing a Tool Built for Agents"
date:   2026-11-25 11:00:00 -0800
summary: "I test Squinch by handing it to AI agents that have never seen it before, 42 at a time. Here's how that's set up and some of what it's turned up..."
---
When I wrote about the [new layout engine](/squinch-layout-engine/), I mentioned that thirty-nine prompts each go to an AI agent that has only the Squinch skill and the CLI. I skipped over how that works, so here's the longer version.

Squinch has plenty of ordinary tests. They check that the code does what I meant, but they don't say much about whether somebody who's never seen the code can read the docs and get a good diagram out of it. Normally you'd learn that from users, slowly.

[Squinch](https://squinch.cc)'s main user is an AI agent, though, and you can start a fresh one whenever you want. So I hand 42 prompts to 42 brand-new agents and see how they do. I call it the gauntlet.

### What a cold agent gets

Each prompt gets its own folder (I call it a box) with three things in it:

- the skill (`SKILL.md` and its reference files, exactly as `squinch skill` installs them)
- `PROMPT.md`, the request
- a `squinch` binary

A fresh `claude -p` session starts in that box. It doesn't have the repo or any example diagrams, and it hasn't seen any earlier answers. Some prompts are tidy:

> Order events flow through EventBridge to two consumers: an email notifier (Lambda plus SNS) and an analytics writer (Lambda plus an S3 data lake). Failed events land in an SQS dead-letter queue. Show asynchronous flows as async.

And some are written the way people actually talk:

> OK so this is our thing. Customers come in through the mobile app or the website, does not really matter, both hit the same gateway. [...] Billing reads from Postgres too. Actually no, scratch that, billing has its own database, separate one. Do not bother with the internal admin tool, nobody cares about it.

One of them hands the agent a real open source repo, pinned to a commit, and asks it to diagram what the code actually does.

### Keep the answers out of reach

The committed answers live in the repo too, so the box has to keep a curious agent away from them.

The easy way to give the agent a CLI is a tiny script on the PATH that calls the one in the repo. But that script has the repo path in it, and two `cd ..`s from there is the folder of answers. So the CLI gets bundled into a single file and copied into the box. Bundling turned up a bug of its own: the CLI read its version from a `package.json` that didn't exist in the bundle. Nothing in CI bundles the CLI, so nothing else would have caught it.

The `squinch` in the box is also a wrapper. It logs every call (arguments, exit code and output) to a file *outside* the box, so I can count attempts without asking the agent how it went.

I can't completely stop an agent with a shell from looking outside its folder without building a real OS sandbox, and that's not worth it. So the harness scans every tool call for paths that leave the box, and if it finds one, that prompt's answer gets thrown out. That happened to one prompt in the latest round.

(Also, don't start a round with uncommitted work. Those agents are running shell commands as you while you go get coffee.)

### Count the attempts

I don't pay much attention to the score at the end of a round. The number I actually watch is **how many times each agent ran `squinch check`**.

If it ran once and got a clean exit with no warnings, the skill covered that prompt on its own. If it ran more than once, I look at the first message it hit. Usually the skill left something out, an error message didn't say how to fix the problem, or the engine has a bug. Whatever a round finds gets fixed in the same commit as the round.

The gauntlet's README puts it this way: a run that scores full marks and finds a crash is a better run than one that scores full marks and finds nothing.

### What it's found

There have been forty rounds since July. Here are some of the things they turned up.

**Missing icons.** Agents don't have to guess icon names. The skill gives them `squinch icons search`, which takes every name they're unsure of in one call and returns the matching ids. But a search can only find what's in the packs, and some words people use all the time weren't in there. Every `check` call from every round gets logged, and there are almost 5,000 of them now. The most common failure in there was an icon that didn't exist. `sys/api` missed 15 times by itself, and the closest match `check` could suggest was `sys/ads`. Agents were also still writing `api`, `worker`, `mobile` and `scheduler` four months after I retired those names on purpose.

[Squinch 0.24](https://github.com/jquatier/squinch/releases/tag/v0.24.0) is mostly about giving those searches more to find. Common words now resolve to the icon you'd expect (`api` is braces, `worker` is a cog, `device` is a phone), and the four retired names are back. The product logos went from 147 to 283, picked from a list of 578 technologies that tend to show up in architecture diagrams. The next round made 213 CLI calls without a single unknown icon, and agents used `sys/api` 20 times.

**Too many errors.** One agent declared nine boxes inside a system, referred to them from outside it without the system's prefix, and got back twenty-eight `unknown id` errors. They were all correct, but the actual problem (a missing prefix) was hard to see in a list that long. Now when three or more errors share a cause, they fold into one message that names it.

**The wrong logo.** A prompt asked for CloudFront and the agent used the Cloudflare logo. That's a real icon, so `check` passed, but it's a different company. A checker can't tell what you meant. The skill now says to search when a request names a specific product, and it lists the pairs that are easy to mix up.

**A fix the agents turned down.** I added an error message that printed a ready-to-paste fix for a layout conflict. In the next round, agents were offered it three times and declined it every time. When I read the transcripts, the agents had a point. The fix would have quietly dropped half of what the user asked for, so they went looking for an arrangement that kept both halves.

### Keep the prompts hard

After eleven rounds of tuning, the original twenty prompts scored full marks two rounds in a row, and everything those rounds found came from the harness. The prompts weren't catching anything anymore. I added nine new ones, including one that deliberately asks for two things that can't both be true. Four of the nine needed a second try right away.

I also try to score only what a prompt asks for. One prompt's scoring required a shared trunk line the prompt never mentioned, so I took it out. It was grading the agent on my taste instead of its work.

### Tips for testing with cold agents

If you're building something for agents to use, here's what I'd pass on:

1. **Give it only what a real user gets.** If the agent can see your repo, you're not really testing your docs.
2. **Log from the outside.** Have the harness count attempts instead of asking the agent.
3. **Watch the retries.** Every extra `check` call points at a doc or an error message to fix.
4. **Read the transcripts.** They tell you whether a failure was the agent, the tool, or your test.
5. **Look for repeats.** If lots of agents ask for the same thing, it's probably worth adding.

The whole setup is in the repo under [`gauntlet/`](https://github.com/jquatier/squinch/tree/main/gauntlet) if you want to borrow it, and you can try Squinch itself in the [playground](https://squinch.cc/playground/).

Enjoy! =)
