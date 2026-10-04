# Runbooks

Step-by-step procedures for work that needs an owner-held account, credential, payment,
or a physical device ([Roadmap §6, owner-held prerequisites](../ROADMAP.md#owner-held-prerequisites)).
Everything up to these steps is built and tested in the repository; each runbook starts
where the code stops.

| Runbook | Prerequisite | Unblocks |
|---|---|---|
| [cloudflare-deploy.md](cloudflare-deploy.md) | P1 | M1-T5, M1 acceptance, M5/M6 backend in production |
| [stores-and-revenuecat.md](stores-and-revenuecat.md) | P2, P3 | M4 sandbox verification, M6 store listings |
| [mobile-builds.md](mobile-builds.md) | P4 (and P2 for distribution) | M2-T5 device checklist, M6 TestFlight / Play testing |
| [validation-campaign.md](validation-campaign.md) | M1 live | M1-T6 readout, Gate G1 |

An agent with the needed credentials in its environment may run these itself; the owner
does not have to perform them personally.
