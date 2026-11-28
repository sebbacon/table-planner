These are immutable examples of published planner formats. Do not regenerate
them with the current serializer or edit them to make a migration test pass.
Add a fixture when introducing a new format; keep the existing examples.

- `planner-v1.json`: legacy groups, generated guest ids, old pairing strength,
  missing columns/pins/venue, a holding guest, and a globally numbered seat.
- `session-unversioned.json`: the historical browser session without a version.
- `planner-v2.json`: Unicode names, stable ids, modern pairing intent/priority,
  mixed table shapes, room positions, table mappings, pins and a saved plan.
- `share-v1.txt`: a fixed link fragment using the original V1 deflate/base64url
  encoding and V2 payload, without saved alternatives. Captured before the shared
  persistence refactor, so it tests compatibility independently of today's writer.
