#!/usr/bin/env bash
set -euo pipefail
test "${ZHIROX_V69_ISOLATED_BRIDGE:-}" = true
test "${PGHOST:-}" = "127.0.0.1"
test "${PGDATABASE:-}" = "zhirox_v59_ci_test"
test "${PGUSER:-}" = localtest
test "${ZHIROX_RELEASE_MODE:-}" != official
test -n "${PGPASSWORD:-}"
test -n "${ZHIROX_V69_POSTGRES_CONTAINER:-}"
test -n "${RUNNER_TEMP:-}"
test "$(psql -At -c "SELECT count(*) FROM zhirox_local.sales WHERE store_id='10000000-0000-0000-0000-000000000059'")" = 7
net=zhirox-v69-isolated-lan
gateway=v69-gateway
pgcontainer="$ZHIROX_V69_POSTGRES_CONTAINER"
workdir="$PWD"
evidence="$PWD/market-lab-evidence"
mkdir -p "$evidence" "$RUNNER_TEMP/v69-private"
cleanup() {
 for i in 1 2 3 4 5; do docker rm -f "v69-pc$i" >/dev/null 2>&1 || true; done
 docker rm -f "$gateway" >/dev/null 2>&1 || true
 docker network disconnect "$net" "$pgcontainer" >/dev/null 2>&1 || true
 docker network rm "$net" >/dev/null 2>&1 || true
 rm -rf "$RUNNER_TEMP/v69-private"
}
trap cleanup EXIT

docker network create --internal --driver bridge --subnet 172.28.69.0/24 "$net" >/dev/null
docker network connect --alias v69db "$net" "$pgcontainer"
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 1 \
 -subj "/CN=v69-gateway" -addext "subjectAltName=DNS:v69-gateway" \
 -keyout "$RUNNER_TEMP/v69-private/key.pem" \
 -out "$RUNNER_TEMP/v69-private/cert.pem" >/dev/null 2>&1
chmod 600 "$RUNNER_TEMP/v69-private/key.pem"
cp "$RUNNER_TEMP/v69-private/cert.pem" "$evidence/v69-cert.pem"
docker run -d --name "$gateway" --hostname v69-gateway \
 --network "$net" --network-alias v69-gateway --ip 172.28.69.10 \
 -v "$workdir:/app" -v "$RUNNER_TEMP/v69-private:/v69-private:ro" -w /app \
 -e ZHIROX_V69_ISOLATED_BRIDGE=true \
 -e ZHIROX_V63_DB_ACTOR_PROOF=true \
 -e ZHIROX_V64_AUTH_GATE_ENABLED=true \
 -e PGHOST=v69db -e PGDATABASE=zhirox_v59_ci_test \
 -e PGUSER=zhirox_v60_api_ci \
 -e PGPASSWORD=V60-SYNTHETIC-CI-ONLY-DO-NOT-REUSE \
 -e ZHIROX_V69_ALLOWED_PEERS=172.28.69.11,172.28.69.12,172.28.69.13,172.28.69.14,172.28.69.15 \
 node:22-bookworm-slim node offline/tests/v69_docker_lan_gateway.mjs >/dev/null

for i in 1 2 3 4 5; do
 docker run -d --name "v69-pc$i" --hostname "v69-pc$i" \
  --network "$net" --ip "172.28.69.$((10+i))" -v "$workdir:/app" -w /app \
  -e ZHIROX_V69_CLIENT_LAN=true \
  node:22-bookworm-slim sleep infinity >/dev/null
done
ready=false
for i in $(seq 1 35); do
 if docker logs "$gateway" 2>&1 | grep -q "V69 LAN GATEWAY READY"; then ready=true; break; fi
 sleep 1
done
if [ "$ready" != true ]; then docker logs "$gateway"; exit 1; fi
test "$(docker network inspect -f '{{.Internal}}' "$net")" = true
for i in 1 2 3 4 5; do
 test "$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "v69-pc$i")" = "172.28.69.$((10+i))"
done
docker exec v69-pc1 node offline/tests/v69_docker_cashier_client.mjs health 1 > "$evidence/v69-health.json"
docker run --rm --name v69-untrusted --network "$net" --ip 172.28.69.16 \
 -v "$workdir:/app" -w /app -e ZHIROX_V69_CLIENT_LAN=true \
 node:22-bookworm-slim node offline/tests/v69_docker_cashier_client.mjs untrusted 6 \
 > "$evidence/v69-untrusted-denial.json"
for i in 1 2 3 4 5; do
 docker exec "v69-pc$i" node offline/tests/v69_docker_cashier_client.mjs login "$i" > "$evidence/v69-pc$i-login.json"
 docker exec "v69-pc$i" node offline/tests/v69_docker_cashier_client.mjs prepare "$i" > "$evidence/v69-pc$i-prepare.json"
done
pids=()
for i in 1 2 3 4 5; do
 docker exec "v69-pc$i" node offline/tests/v69_docker_cashier_client.mjs commit "$i" > "$evidence/v69-pc$i-commit.json" &
 pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
winners=0;losers=0;recovery_client=""
for i in 1 2 3 4 5; do
 if grep -q '"committed":true' "$evidence/v69-pc$i-commit.json"; then
  winners=$((winners+1))
 elif grep -q '"committed":false' "$evidence/v69-pc$i-commit.json"; then
  losers=$((losers+1));recovery_client="$i"
 else echo "unexpected cashier response";exit 1; fi
 docker exec "v69-pc$i" node offline/tests/v69_docker_cashier_client.mjs finalize "$i" > "$evidence/v69-pc$i-finalize.json"
done
test "$winners" = 3
test "$losers" = 2
test "$(psql -At -c "SELECT stock_base_units FROM zhirox_local.products WHERE id='30000000-0000-0000-0000-000000000069'")" = 1
docker exec "v69-pc$recovery_client" node offline/tests/v69_docker_cashier_client.mjs recovery-prepare "$recovery_client" > "$evidence/v69-pending-before-cable-break.json"
test "$(psql -At -c "SELECT count(*) FROM zhirox_local.checkout_intents_v31 WHERE request_id='50000000-0000-0000-0000-000000000101' AND state='prepared'")" = 1
docker network disconnect "$net" "v69-pc$recovery_client"
docker exec "v69-pc$recovery_client" node offline/tests/v69_docker_cashier_client.mjs offline "$recovery_client" > "$evidence/v69-actual-network-disconnect.json"
other=$((recovery_client%5+1))
docker exec "v69-pc$other" node offline/tests/v69_docker_cashier_client.mjs health "$other" > "$evidence/v69-other-pc-continues.json"
test "$(psql -At -c "SELECT count(*) FROM zhirox_local.checkout_intents_v31 WHERE request_id='50000000-0000-0000-0000-000000000101' AND state='prepared'")" = 1
docker network connect --ip "172.28.69.$((10+recovery_client))" "$net" "v69-pc$recovery_client"
docker exec "v69-pc$recovery_client" node offline/tests/v69_docker_cashier_client.mjs recovery-commit "$recovery_client" > "$evidence/v69-recovered-400-iqd-sale.json"
for i in 1 2 3 4 5; do
 docker exec "v69-pc$i" node offline/tests/v69_docker_cashier_client.mjs close "$i" > "$evidence/v69-pc$i-shift-close.json"
done
NODE_OPTIONS='--require=./offline/tests/v65_wan_egress_guard.cjs' \
 node offline/tests/v69_docker_lan_final_audit.mjs "$recovery_client"
echo "V69 DOCKER INTERNAL PRIVATE LAN PASS: five clients, NIC detach/reattach, no external WAN"
