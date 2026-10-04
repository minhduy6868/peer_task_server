data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "aws_vpc" "this" {
  cidr_block           = "10.40.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.project}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.project}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = "10.40.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
  tags                    = { Name = "${var.project}-public-a" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${var.project}-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "api" {
  name   = "${var.project}-api"
  vpc_id = aws_vpc.this.id

  ingress {
    description = "PeerTask HTTP + Socket.IO"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH (lock this to your IP after first login)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name   = "${var.project}-rds"
  vpc_id = aws_vpc.this.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.project}-db"
  subnet_ids = [aws_subnet.public.id, aws_subnet.public_b.id]
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = "10.40.2.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true
  tags                    = { Name = "${var.project}-public-b" }
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

resource "aws_db_instance" "this" {
  identifier             = "${var.project}-pg"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  db_name                = "peertask"
  username               = "peertask"
  password               = random_password.db.result
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 0
  tags                   = { Name = "${var.project}-rds" }
}

resource "aws_iam_role" "ec2" {
  name = "${var.project}-ec2"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project}-ec2"
  role = aws_iam_role.ec2.name
}

resource "aws_instance" "api" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.api.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = true
  user_data_replace_on_change = true

  user_data = replace(<<-EOT
#!/bin/bash
set -eux
exec > /var/log/peertask-boot.log 2>&1
dnf install -y git gcc-c++ make python3 nodejs20
NODE_BIN=/usr/bin/node-20
NPM_BIN=/usr/bin/npm-20
if [ ! -x "$NODE_BIN" ]; then NODE_BIN=/usr/bin/node; fi
if [ ! -x "$NPM_BIN" ]; then NPM_BIN=/usr/bin/npm; fi
mkdir -p /opt
cd /opt
rm -rf peer_task_server
git clone --branch main --depth 1 https://github.com/minhduy6868/peer_task_server.git
cd peer_task_server
"$NPM_BIN" ci --omit=dev
python3 - <<'PY'
from pathlib import Path
path = Path("src/db/pool.js")
text = path.read_text()
needle = "connectionString: process.env.DATABASE_URL,"
insert = needle + "\n  ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : undefined,"
if "rejectUnauthorized" not in text and needle in text:
    path.write_text(text.replace(needle, insert, 1))
PY
cat >/etc/peertask.env <<ENV
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://peertask:${random_password.db.result}@${aws_db_instance.this.address}:5432/peertask
JWT_SECRET=${random_password.jwt.result}
ENV
chmod 600 /etc/peertask.env
"$NODE_BIN" src/db/migrate.js || true
"$NODE_BIN" src/db/migrations/add_task_fields.js || true
cat >/etc/systemd/system/peertask-api.service <<UNIT
[Unit]
Description=PeerTask API
After=network.target
[Service]
WorkingDirectory=/opt/peer_task_server
EnvironmentFile=/etc/peertask.env
ExecStart=$NODE_BIN src/index.js
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now peertask-api
EOT
  , "\r", "")

  tags = { Name = "${var.project}-api" }

  depends_on = [aws_db_instance.this]
}
