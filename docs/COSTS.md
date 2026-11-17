# Costs

The full cost analysis — unit prices, assumptions, three usage scenarios (very low / small / moderate), free-tier caveats and cost controls — is in [`AWS_COST_ANALYSIS.md`](../AWS_COST_ANALYSIS.md) at the repository root.

Summary: every component is pay-per-use. At thesis scale the estimate is about $1 per month at list price (mostly CloudWatch alarms, which the always-free allowance normally covers); about $2.35 for a small application (300,000 requests); about $25 for 5 million requests. The unit prices are Stockholm (eu-north-1) list prices read from the AWS Price List API on 2026-11-16; the scenarios remain estimates — there is no bill yet because nothing has been deployed.
