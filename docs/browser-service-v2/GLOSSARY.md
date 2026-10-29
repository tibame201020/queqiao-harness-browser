# Browser Service V2 — Domain Glossary

**Browser Service**: Independently running HTTP server for controlled browser operations. _Avoid_: Queqiao extension.

**Client**: Authorized consumer of the HTTP interface. _Avoid_: Worker.

**Connection**: Opaque, server-authorized reference to a browser access identity. _Avoid_: raw profile name or directory.

**Owner Host**: Single runtime host that controls a Browser Identity.

**Browser Identity**: The physical browser/session/profile authority associated with a Connection.

**Target**: Identity-verified authorized saved conversation.

**Operation**: Durable client-scoped request/result identity at the Service interface. _Avoid_: n8n Execution, Harness Run.

**Send Operation**: Operation requesting one user turn in a Target.

**Collect Operation**: Operation reading the complete assistant turn attributable to a specific Send.

**Send Attempt**: Harness-private evidence of a possibly dispatched Send; the source of truth for read-only Resume.

**Receipt**: Observed evidence and outcome, distinct from HTTP acknowledgement.

**UNKNOWN**: A side effect may have occurred but has not been proven or ruled out. _Avoid_: failed, safe-to-retry.

**Reconcile**: Read-only recovery of the original Send's evidence. _Avoid_: resend.

**Quarantined Connection**: Connection frozen because ownership/proof cannot be verified.

**Idempotency Key**: Client-created identity of one submission intent mapped to one Operation, including repeated HTTP calls.

**Workflow**: A task-specific native n8n graph. _Avoid_: fixed Browser Service orchestration template.
