# Terraform Infrastructure

Infrastructure management for **Re.wear**.

## Structure

```text
terraform/
└── environments/
    ├── aws/         # AWS Singapore (ap-southeast-1)
    └── oci/         # Oracle Cloud (ap-singapore-2)
```

## Quick Start (AWS)

```bash
cd terraform/environments/aws
terraform init
terraform plan
terraform apply
```

To SSH into the provisioned server:
```bash
ssh -i ~/.ssh/github_personal ubuntu@<public_ip>
```
