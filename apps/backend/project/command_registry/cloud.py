"""
Cloud Provider Commands Module
==============================

Commands for cloud provider CLIs and platform-specific tooling.
"""


# =============================================================================
# CLOUD PROVIDER CLIs
# =============================================================================

CLOUD_COMMANDS: dict[str, set[str]] = {
    "aws": {
        "aws",
        "sam",
        "cdk",
        "amplify",
        "eb",  # AWS CLI, SAM, CDK, Amplify, Elastic Beanstalk
    },
    "gcp": {
        "gcloud",
        "gsutil",
        "bq",
        "firebase",
    },
    "azure": {
        "az",
        "func",  # Azure CLI, Azure Functions
    },
    "vercel": {
        "vercel",
        "vc",
    },
    "netlify": {
        "netlify",
        "ntl",
    },
    "heroku": {
        "heroku",
    },
    "railway": {
        "railway",
    },
    "fly": {
        "fly",
        "flyctl",
    },
    "render": {
        "render",
    },
    "cloudflare": {
        "wrangler",
        "cloudflared",
    },
    "digitalocean": {
        "doctl",
    },
    "linode": {
        "linode-cli",
    },
    "supabase": {
        "supabase",
    },
    "planetscale": {
        "pscale",
    },
    "neon": {
        "neonctl",
    },
}


__all__ = ["CLOUD_COMMANDS"]
