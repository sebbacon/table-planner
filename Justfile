port := "5173"
preview_port := "4173"

default: dev

install:
    npm install

dev:
    npm run dev -- --port {{port}}

stop:
    @pids="$(lsof -ti tcp:{{port}})"; if [ -n "$pids" ]; then echo "Stopping server on port {{port}}"; kill $pids; else echo "No server running on port {{port}}"; fi

restart:
    @just stop
    @sleep 0.5
    npm run dev -- --port {{port}}

test:
    npm test

build:
    npm run build

preview:
    npm run preview -- --port {{preview_port}}
