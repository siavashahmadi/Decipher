FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install Chromium (system) for headless visual verification by the agent.
# The agent uses `chromium --headless --screenshot` to capture pages at
# different viewports and reads the resulting PNGs to verify CSS work
# visually. No Playwright/Puppeteer wrapper needed — the chromium CLI
# has screenshot support built in.
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libnss3 libatk-bridge2.0-0 libxkbcommon0 libgbm1 \
  libdrm2 libxcomposite1 libxdamage1 libxrandr2 libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Rename the base image's "node" user (UID 1000) to "agent".
# This keeps UID 1000 so that --userns=keep-id (Podman) and
# --user 1000:1000 (Docker) map to the correct home directory owner.
RUN usermod -d /home/agent -m -l agent node
USER agent

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

# Sandcastle's Docker provider runs containers with --user <hostUid>:<hostGid>
# so worktree files match host ownership. On macOS (host UID 501) this
# does not match our agent user (UID 1000), so the running user cannot
# write .gitconfig to its own HOME. Open up perms on /home/agent so any
# UID can use it as a working HOME.
USER root
RUN chmod -R a+rwX /home/agent
USER agent

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
