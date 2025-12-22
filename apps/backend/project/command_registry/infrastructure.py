"""
Infrastructure Commands Module
==============================

Commands for containerization, orchestration, IaC, and DevOps tooling.
"""


# =============================================================================
# INFRASTRUCTURE/DEVOPS COMMANDS
# =============================================================================

INFRASTRUCTURE_COMMANDS: dict[str, set[str]] = {
    "docker": {
        "docker",
        "docker-compose",
        "docker-buildx",
        "dockerfile",
        "dive",  # Dockerfile analysis
    },
    "podman": {
        "podman",
        "podman-compose",
        "buildah",
    },
    "kubernetes": {
        "kubectl",
        "k9s",
        "kubectx",
        "kubens",
        "kustomize",
        "kubeseal",
        "kubeadm",
    },
    "helm": {
        "helm",
        "helmfile",
    },
    "terraform": {
        "terraform",
        "terragrunt",
        "tflint",
        "tfsec",
    },
    "pulumi": {
        "pulumi",
    },
    "ansible": {
        "ansible",
        "ansible-playbook",
        "ansible-galaxy",
        "ansible-vault",
        "ansible-lint",
    },
    "vagrant": {
        "vagrant",
    },
    "packer": {
        "packer",
    },
    "minikube": {
        "minikube",
    },
    "kind": {
        "kind",
    },
    "k3d": {
        "k3d",
    },
    "skaffold": {
        "skaffold",
    },
    "argocd": {
        "argocd",
    },
    "flux": {
        "flux",
    },
    "istio": {
        "istioctl",
    },
    "linkerd": {
        "linkerd",
    },
}


__all__ = ["INFRASTRUCTURE_COMMANDS"]
