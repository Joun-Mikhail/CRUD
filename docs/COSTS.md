# Costs

The full cost analysis — unit prices, assumptions, three usage scenarios (very low / small / moderate), free-tier caveats and cost controls — is in [`AWS_COST_ANALYSIS.md`](../AWS_COST_ANALYSIS.md) at the repository root.

Summary: every component is pay-per-use. At thesis scale the estimate is about $1 per month at list price (mostly CloudWatch alarms, which the always-free allowance normally covers); about $2.50 for a small application (300,000 requests); about $27 for 5 million requests. Free Tier and Cognito allowances were confirmed online; the Frankfurt-specific unit prices were not — check them before quoting.
