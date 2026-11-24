terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# 1. SSH Key Pair
resource "aws_key_pair" "deployer" {
  key_name   = "rewear-ec2-key"
  public_key = file(pathexpand(var.public_key_path))
}

# 2. Security Group
resource "aws_security_group" "rewear_sg" {
  name        = "rewear-server-sg"
  description = "Security group for Rewear server"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "rewear-security-group"
    Project = "rewear"
  }
}

# 3. IAM Role for EC2 (SSM Agent)
resource "aws_iam_role" "ec2_role" {
  name = "rewear-ec2-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_ssm_policy" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ec2_ecr_policy" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "rewear-ec2-instance-profile"
  role = aws_iam_role.ec2_role.name
}

# 4. AMI Lookup
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# 5. EC2 Instance
resource "aws_instance" "rewear_server" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  key_name                    = aws_key_pair.deployer.key_name
  vpc_security_group_ids      = [aws_security_group.rewear_sg.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2_profile.name
  associate_public_ip_address = true

  root_block_device {
    volume_size           = var.disk_size_gb
    volume_type           = "gp3"
    delete_on_termination = true
    tags = {
      Name = "rewear-root-disk"
    }
  }

  user_data = <<-EOF
              #!/bin/bash
              set -e

              fallocate -l 2G /swapfile
              chmod 600 /swapfile
              mkswap /swapfile
              swapon /swapfile
              echo '/swapfile none swap sw 0 0' >> /etc/fstab

              apt-get update -y
              apt-get install -y ca-certificates curl gnupg lsb-release git htop ufw snapd

              # Ensure SSM Agent is running
              snap install amazon-ssm-agent --classic || true
              systemctl enable snap.amazon-ssm-agent.amazon-ssm-agent.service || true
              systemctl start snap.amazon-ssm-agent.amazon-ssm-agent.service || true

              # Install Docker
              install -m 0755 -d /etc/apt/keyrings
              curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
              chmod a+r /etc/apt/keyrings/docker.asc

              echo \
                "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
                $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                tee /etc/apt/sources.list.d/docker.list > /dev/null

              apt-get update -y
              apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nginx

              usermod -aG docker ubuntu
              systemctl enable docker
              systemctl start docker

              # Configure Nginx reverse proxy (Port 80 -> NestJS 3001)
              cat <<'NGINX_CONF' > /etc/nginx/sites-available/rewear
server {
    listen 80;
    server_name _;
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }
}
NGINX_CONF

              rm -f /etc/nginx/sites-enabled/default
              ln -sf /etc/nginx/sites-available/rewear /etc/nginx/sites-enabled/rewear
              systemctl restart nginx

              # Setup production docker-compose
              cat <<'COMPOSE_CONF' > /home/ubuntu/docker-compose.prod.yml
services:
  db:
    image: postgres:16-alpine
    container_name: rewear-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: $${DB_USERNAME}
      POSTGRES_PASSWORD: $${DB_PASSWORD}
      POSTGRES_DB: $${DB_NAME}
    ports:
      - '127.0.0.1:5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${DB_USERNAME} -d $${DB_NAME}']
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

  backend:
    image: $${IMAGE_REGISTRY:-955449981747.dkr.ecr.ap-southeast-1.amazonaws.com}/$${IMAGE_REPOSITORY:-rewear-be}:$${IMAGE_TAG:-latest}
    container_name: rewear-be
    restart: unless-stopped
    network_mode: host
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
    external: true
    name: ubuntu_postgres_data
COMPOSE_CONF
              chown ubuntu:ubuntu /home/ubuntu/docker-compose.prod.yml
              EOF

  tags = {
    Name    = "rewear-server-dev"
    Project = "rewear"
    Env     = "dev"
  }
}

# 6. ECR Repository for Docker Images
resource "aws_ecr_repository" "rewear_be" {
  name                 = "rewear-be"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = {
    Name    = "rewear-be"
    Project = "rewear"
  }
}

# 7. GitHub Actions OIDC IAM Role
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_actions_role" {
  name = "rewear-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "github_actions_policy" {
  name = "rewear-github-actions-deploy-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuth"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "ECROperations"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:GetRepositoryPolicy",
          "ecr:DescribeRepositories",
          "ecr:ListImages",
          "ecr:DescribeImages",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ]
        Resource = aws_ecr_repository.rewear_be.arn
      },
      {
        Sid    = "SSMCommandExecution"
        Effect = "Allow"
        Action = [
          "ssm:SendCommand",
          "ssm:GetCommandInvocation",
          "ssm:ListCommands",
          "ssm:ListCommandInvocations"
        ]
        Resource = [
          "arn:aws:ec2:*:*:instance/${aws_instance.rewear_server.id}",
          "arn:aws:ssm:*:*:document/AWS-RunShellScript"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_actions_attach" {
  role       = aws_iam_role.github_actions_role.name
  policy_arn = aws_iam_policy.github_actions_policy.arn
}
