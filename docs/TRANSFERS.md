# Inter-facility transfers

How a platelet unit moves from one hospital to another, and what stops it
moving when it shouldn't.

## Roles come from the transfer, not the caller

Every transfer row names a **sender** (`source_bank_id`) and a **receiver**
(`destination_bank_id`). Which one opened it depends on the direction:

| Direction | Opened by | Sender | Receiver |
|---|---|---|---|
| `SHORTAGE_PULL` | the facility that is short | the counterparty | the opener |
| `WASTAGE_PUSH`  | the facility holding near-expiry units | the opener | the counterparty |

Either way the **sender** authorises, reserves stock, and issues both codes;
the **receiver** redeems the receipt code. Every mutating endpoint compares the
caller's `bank_id` (read off the JWT, never off the request body) against the
row and returns 403 otherwise. A facility cannot accept a request addressed to
someone else, and cannot redeem a code that was not issued to it.

## The two codes

Both are issued **by the sending facility**. They differ in who may redeem them.

**Pickup code** — issued when the sender authorises. Read out to the rider at
the door; the sender confirms it on their own console, and that confirmation is
what releases custody to the courier.

**Receipt code** — issued at dispatch, redeemable **only by the receiving
facility** (`verifier_bank_id` is checked on every attempt). Redeeming it is
the single action that moves units between the two ledgers.

Properties:

- The plaintext is returned exactly once, to the issuer, in the response to the
  action that created it. It is never re-fetchable and never appears in any
  list or tracking payload — those say only whether a code is live and who owes
  it.
- Only an HMAC-SHA256 digest is stored, keyed with `OTP_SECRET`. A database
  read cannot reveal a live code.
- Digits come from `secrets`, not `random`.
- Expiry (`OTP_EXPIRY_SECONDS`), attempt cap (`OTP_MAX_ATTEMPTS`), and an
  issue-rate cap (`OTP_MAX_PER_HOUR`) all apply.
- A wrong-facility attempt is rejected **without burning an attempt**, so one
  console cannot lock another out.
- Re-issuing supersedes the previous code for that purpose. Both codes have a
  re-issue endpoint, because a code shown once and then lost would otherwise
  strand a shipment with units reserved and no way to settle them.

## State machine

```
REQUESTED
   │  sender authorises ─────────────────────────────┐
   ▼                                                 ▼
UNITS_RESERVED ──► SHIPMENT_CREATED ──► AWB_ASSIGNED ──► PICKUP_OTP_REQUIRED
                                                              │
                                    sender confirms pickup code
                                                              ▼
                                                         IN_TRANSIT
                                                              │
                                      courier scan (optional) ▼
                                                           ARRIVED
                                                              │
                                 receiver redeems receipt code
                                                              ▼
                                                   TRANSFER_COMPLETED

Off-ramps: DECLINED (sender refuses) · CANCELLED (opener withdraws,
pre-dispatch only) · FAILED (courier dispatch failed; reservation rolled back)
```

## What touches inventory

Real `InventoryUnit` rows move, not a counter.

- **Authorise** reserves `units` rows at the sender, **nearest expiry first**,
  so a transfer drains the stock that would otherwise be wasted. Insufficient
  stock returns 409 and changes nothing.
- **Courier dispatch failure** releases the reservation before returning 502,
  so a logistics outage never strands usable units.
- **Receipt** re-parents those exact rows to the receiver and marks them
  `AVAILABLE` there. The bag keeps its id, bag number, and expiry, so
  provenance survives the move.
- Decline and cancel release the reservation.

Every step writes an `InventoryEvent` on both sides and an `AuditLog` entry.

## Where the map position comes from

`GET /transfers/{id}/track` returns `location.location_source`, which is one of:

| Value | Meaning |
|---|---|
| `courier_live` | a courier GPS fix under 3 minutes old |
| `courier_last_known` | a courier fix, but a stale one |
| `route_projection` | interpolated along the routed polyline from elapsed transit time — **not** telemetry |
| `origin` / `destination` | parked at an endpoint |
| `unavailable` | no route and no fix |

An intra-city medical courier usually has no consumer tracking feed, so
`route_projection` is the normal case. The UI labels it as a projection and
draws it without the pulse animation used for a live fix. The simulated courier
adapters deliberately return **no** coordinates rather than inventing one —
a fabricated fix is indistinguishable from a real one once it reaches the map.

## Why a webhook cannot complete a transfer

A courier scan reading `DELIVERED` moves the row to `ARRIVED` and asks the
receiver for their code. It does not settle the units. A scan is a claim by a
third party; the receipt code is the receiving facility asserting they have the
box in hand and have checked the cold-chain seal. Only the latter moves stock.

The webhook endpoint also refuses every request unless `SHIPROCKET_WEBHOOK_TOKEN`
is configured, verifies an HMAC signature when one is present, and
de-duplicates retried scans by event id.
