// The admission route line: one stop per stage of the admission workflow.
const STOPS = ['Applied', 'Documents', 'Eligibility', 'Payment', 'Seat', 'Enrolled'];

// status -> where the applicant is on the line. `at` is the current stop; `failed` marks a stop that was not passed.
const POSITION = {
  SUBMITTED: { at: 1 },
  DOCS_PENDING: { at: 1 },
  DOCS_VERIFIED: { at: 2 },
  ELIGIBLE: { at: 3 },
  NOT_ELIGIBLE: { failed: 2 },
  PAYMENT_PENDING: { at: 3 },
  PAID: { at: 4 },
  REJECTED: { failed: 4 },
  ADMITTED: { at: 5 },
  ENROLLED: { at: 6 },
};

export default function Route({ status }) {
  const pos = status ? POSITION[status] || { at: 0 } : { at: -1 };
  return (
    <ol className="route" aria-label={status ? `Admission progress: ${status}` : 'Admission steps'}>
      {STOPS.map((label, i) => {
        let cls = '';
        if (pos.failed !== undefined) {
          if (i < pos.failed) cls = 'done';
          else if (i === pos.failed) cls = 'failed';
        } else {
          if (i < pos.at) cls = 'done';
          else if (i === pos.at) cls = 'current';
        }
        return <li key={label} className={cls}>{label}</li>;
      })}
    </ol>
  );
}
