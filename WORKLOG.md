# MyAgent work log

Nova's running log of work on MyAgent. Newest first. Times are Pacific.

## 2026-11-08 (Sunday)

- **Offer copy.** The site now matches the current offer. The first 25 local businesses still get a free business review. Each helper is its own Build Sprint: $1,500, or $750 for those 25. Bigger workflows and website work are quoted case by case. A helper is a one-time build plus a monthly cost to keep it running. Optional teaching can run 3 to 6 months. The lead offer is an AI receptionist. Text-back is the alternative if the business keeps answering. Callers keep their phone number and phone company, and calls forward over.

## 2026-11-06 (Friday)

- **Custom domain.** Registered `myagent.company` and pointed it at this GitHub Pages site. The apex has A records for the four GitHub Pages IPs, and `www` is a CNAME to `myagentllc.github.io`. HTTPS works. Added `CNAME`, `sitemap.xml` and `robots.txt`, and moved canonical, Open Graph and JSON-LD URLs to `https://myagent.company/` ([#3](https://github.com/MyAgentLLC/myagentllc.github.io/pull/3)).
- **Full site content refresh** ([#3](https://github.com/MyAgentLLC/myagentllc.github.io/pull/3)).
  - Every page now focuses on missed-call text-back for Redding and Shasta County care homes, assisted living and nursing facilities, plus plumbing, HVAC and electrical.
  - Removed the old offers: the assessment, the retainer, thumbnail orders, playbooks, Gumroad, the NOVA20 coupon, the booking calendar, the stat counters, and all "audit" wording.
  - The questionnaire was rewritten around missed calls and phones, and Nova's chat fallback answers were updated to match.
- **Offer update** ([#4](https://github.com/MyAgentLLC/myagentllc.github.io/pull/4)).
  - The first 25 local businesses get a free business review, plus 50% off the Build Sprint ($750 instead of $1,500).
  - The Build Sprint is the paid setup.
  - The main call-to-action is now "Request the free review".
- **Outreach drafts** were updated to the new offer. They are still unsent and waiting on owner approval.
- **Domain for Proofline Studio** registered at the same time (`proofline.company`). Codex was notified over Agent2Agent.
- **Inbox watch.** An hourly check (7am–9pm) of the MyAgent inbox and Codex messages. It pings the owner only when a decision is needed.
- **Phone line research.** The cheapest workable line for missed-call text-back is a toll-free number on Twilio or SignalWire. A local 530 number is the preferred upgrade. Not purchased yet.

## 2026-11-05 (Thursday)

- **Business email moved to Inkbox.** Site contact switched to `myagentllc2026@inkboxmail.com` everywhere: footer, contact form, questionnaire and Nova's chat replies ([#2](https://github.com/MyAgentLLC/myagentllc.github.io/pull/2)).
- **Public endpoint.** An Inkbox tunnel is live at `https://myagentllc2026.inkboxwire.com`, with a `/webhook` receiver and a `/health` check. This is the base for the missed-call text-back demo.
- **Agent teamwork.** Opened Agent2Agent with Codex (Proofline Studio) to share leads, referrals and setup know-how. Sent Codex a rundown of how the website chatbot runs for free: a Cloudflare Worker on Workers AI's free tier, with a built-in keyword fallback.
- **New niche: Redding-area care homes.**
  - Built a list of 42 nursing homes, assisted living and board-and-care homes in Redding, Anderson, Shasta Lake and Palo Cedro, and loaded it into the CRM.
  - Drafted personal emails for the 6 that have a public email. The rest are phone-only.
- **Trades outreach.** Drafted 8 personal emails to local plumbing, HVAC and electrical shops. They are unsent.
- **Tools connected:** Composio (for posting to X with media) and HubSpot CRM.

## 2026-11-04 (Wednesday)

- Took over MyAgent marketing and dropped all previous marketing content to start fresh.
- Picked the core offer: missed-call text-back for local businesses.
- **Site fix:** the old AgentMail address was removed and the order button was repointed ([#1](https://github.com/MyAgentLLC/myagentllc.github.io/pull/1)).
- Made short-video concepts for X. They were rejected, not posted, and retired.

## Next up

- Get the business phone line and finish the live missed-call text-back demo.
- Submit `myagent.company` to Google Search Console and set up a Google Business Profile.
- Send outreach once approved.
