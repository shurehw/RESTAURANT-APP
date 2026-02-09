## OpsOS Product North Star

### What We Are

OpsOS is an **enforcement engine** for restaurant operations.

It exists to convert operational variance into **mandatory explanation, corrective action, and follow-through** — every night, without exception.

OpsOS is not analytics.
OpsOS is not advisory software.
OpsOS is not a workflow builder.

OpsOS enforces discipline.

---

### The Non-Negotiable Loop

Every product decision must reinforce this loop:

```
Data → Exception → Attestation → Task → Resolution → Audit
```

If a feature weakens any step in this loop, it does not ship.

---

### What Success Looks Like

OpsOS is successful when:

* Bad nights cannot be ignored
* Variance always has an owner
* Explanations are structured and repeatable
* Tasks persist until resolved
* History cannot be rewritten
* Removing OpsOS causes loss of control, not inconvenience

If OpsOS disappears and the customer says "we lost accountability," we won.
If they say "we lost a dashboard," we failed.

---

### What We Never Optimize For

* Flexibility over enforcement
* Customization over standards
* Insight over action
* AI autonomy over human accountability
* SMB volume over operator seriousness

---

### Allowed Configuration (Bounded)

Customers may calibrate:

* targets and thresholds (within limits)
* ownership and escalation
* action templates
* read-only views

Customers may not modify:

* canonical metrics
* exception existence
* attestation requirements
* task persistence
* audit logging
* enforcement logic

Tunable does not mean optional.

---

### Engineering Rule

Any PR must answer:

> "Does this increase or decrease enforced accountability?"

If the answer is unclear or negative, the PR is rejected.

---

### Product Kill Test

If a feature allows a manager to avoid:

* explaining variance
* owning an outcome
* completing follow-through

…it violates the North Star and must be removed.
