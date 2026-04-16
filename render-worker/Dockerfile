FROM node:20-slim

# Headless Blender + OpenSCAD for geometry rendering.
RUN apt-get update && apt-get install -y \
  blender \
  openscad \
  xvfb \
  python3-numpy \
  && rm -rf /var/lib/apt/lists/*
# python3-numpy is already on the system Python path that Blender 3.4 (Debian) uses.
# Do NOT set PYTHONPATH — it causes numpy ABI conflicts with Blender's Python.

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 8787
CMD ["node", "server.js"]
