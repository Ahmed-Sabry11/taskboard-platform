// Generates the defence presentation.
//
//   docker run --rm -v "${PWD}:/repo" node:24-alpine sh -c \
//     "cd /tmp && npm install pptxgenjs@4 >/dev/null 2>&1 && cd /repo/docs/presentation && NODE_PATH=/tmp/node_modules node build-deck.js"
//
// Text in [square brackets] is a placeholder for the team to fill in.

const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

const SHOTS = path.join(__dirname, '..', 'evaluation', 'screenshots');
const DIAGRAMS = path.join(__dirname, '..', 'book', 'diagrams');

const INK = '0B1F2A';
const TEAL = '0F766E';
const TEAL_TINT = 'E3F2EF';
const AMBER = 'D97706';
const RED = 'B91C1C';
const GRAY = '5B6B73';
const TINT = 'F1F5F6';
const WHITE = 'FFFFFF';
const HEAD = 'Cambria';
const BODY = 'Calibri';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
pres.title = 'Secure, Auto-Scaling Multi-Service Infrastructure Using GitOps and Kubernetes';
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };

pres.defineSlideMaster({
  title: 'DARK',
  background: { color: INK },
});

pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: WHITE },
  objects: [
    { text: { text: 'GPJ2617  |  Secure, Auto-Scaling Infrastructure Using GitOps and Kubernetes', options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontFace: BODY, fontSize: 10, color: GRAY, margin: 0 } } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.35, w: 12.1, h: 1.0, fontFace: HEAD, fontSize: 30, bold: true, color: INK, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontFace: BODY, fontSize: 10, color: GRAY, align: 'right' },
});

// ---- helpers -----------------------------------------------------------------

let section = '';
function startSection(title) { section = title; pres.addSection({ title }); }

function content(title, notes) {
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section });
  s.addText(title, { placeholder: 'title' });
  if (notes) s.addNotes(notes);
  return s;
}

function text(s, t, o) {
  s.addText(t, { fontFace: BODY, fontSize: 15, color: INK, margin: 0, valign: 'top', isTextBox: true, ...o });
}

function card(s, x, y, w, h, fill = TINT) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill, width: 0 } });
}

function badge(s, x, y, label, fill = TEAL) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: 0.5, h: 0.5, fill: { color: fill }, line: { color: fill, width: 0 } });
  s.addText(String(label), { x, y, w: 0.5, h: 0.5, fontFace: BODY, fontSize: 16, bold: true, color: WHITE, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
}

function stat(s, x, y, w, value, label, color = TEAL) {
  text(s, value, { x, y, w, h: 0.8, fontFace: HEAD, fontSize: 40, bold: true, color, valign: 'middle' });
  text(s, label, { x, y: y + 0.82, w, h: 0.6, fontSize: 14, color: GRAY });
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// Fit an image inside a box, centred, keeping its aspect ratio.
function image(s, file, x, y, w, h) {
  const size = pngSize(file);
  const scale = Math.min(w / size.w, h / size.h);
  const iw = size.w * scale;
  const ih = size.h * scale;
  s.addImage({ path: file, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih });
}

function box(s, label, x, y, w, h, fill, color = INK, bold = false) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: fill }, line: { color: fill === WHITE ? 'B6C4C9' : fill, width: 1 } });
  s.addText(label, { x, y, w, h, fontFace: BODY, fontSize: 12, bold, color, align: 'center', valign: 'middle', margin: 0.04, isTextBox: true });
}

function arrowRight(s, x, y, w) {
  s.addShape(pres.ShapeType.line, { x, y, w, h: 0, line: { color: INK, width: 1.5, endArrowType: 'triangle' } });
}

function arrowDown(s, x, y, h) {
  s.addShape(pres.ShapeType.line, { x, y, w: 0, h, line: { color: INK, width: 1.5, endArrowType: 'triangle' } });
}

const shot = (n) => path.join(SHOTS, n);
const diagram = (n) => path.join(DIAGRAMS, n);

// ---- 1. title ----------------------------------------------------------------

startSection('Introduction');
{
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: section });
  text(s, 'GRADUATION PROJECT  |  GPJ2617', { x: 0.8, y: 0.8, w: 11, h: 0.4, fontSize: 14, color: '7FD1C4', charSpacing: 3 });
  text(s, 'Secure, Auto-Scaling Multi-Service Infrastructure Using GitOps and Kubernetes', { x: 0.8, y: 1.4, w: 11.2, h: 2.4, fontFace: HEAD, fontSize: 40, bold: true, color: WHITE });
  text(s, 'Design and implementation, measured on Amazon EKS', { x: 0.8, y: 3.9, w: 11, h: 0.5, fontSize: 20, color: 'CFE3E0' });
  text(s, [
    { text: 'Team', options: { bold: true, color: '7FD1C4', breakLine: true } },
    { text: '[Student Name 1]    [Student Name 2]', options: { breakLine: true } },
    { text: '[Student Name 3]    [Student Name 4]' },
  ], { x: 0.8, y: 5.1, w: 6, h: 1.3, fontSize: 16, color: WHITE });
  text(s, [
    { text: 'Supervisor', options: { bold: true, color: '7FD1C4', breakLine: true } },
    { text: '[Supervisor Name and Title]', options: { breakLine: true } },
    { text: '[University]  |  [Faculty]  |  [Academic Year]' },
  ], { x: 7.0, y: 5.1, w: 5.6, h: 1.3, fontSize: 16, color: WHITE });
  s.addNotes('Introduce the team and the title. One sentence: we built the platform that builds, deploys, scales and heals an application without manual steps, and we measured it on AWS.');
}

// ---- 2. problem --------------------------------------------------------------

{
  const s = content('Manual deployment is slow, fragile and invisible', 'These are the weaknesses the project sets out to remove. Each one maps to a part of the solution on the next slide.');
  const items = [
    ['Depends on one person', 'Releases wait for the one person who knows the steps.'],
    ['No reliable record', 'Nobody can say what changed on the server, when, or by whom.'],
    ['Environments drift', 'Fixes applied by hand make every environment different.'],
    ['Fixed capacity', 'A traffic surge degrades or stops the service.'],
    ['Failures found by users', 'Without monitoring, the first alert is a complaint.'],
    ['Inconsistent security', 'Controls depend on someone remembering to apply them.'],
  ];
  items.forEach(([head, body], i) => {
    const x = 0.6 + (i % 3) * 4.1;
    const y = 1.7 + Math.floor(i / 3) * 2.55;
    card(s, x, y, 3.9, 2.25);
    badge(s, x + 0.3, y + 0.3, i + 1, RED);
    text(s, head, { x: x + 0.3, y: y + 0.95, w: 3.3, h: 0.4, fontSize: 17, bold: true });
    text(s, body, { x: x + 0.3, y: y + 1.38, w: 3.3, h: 0.75, fontSize: 14, color: GRAY });
  });
}

// ---- 3. what we built --------------------------------------------------------

{
  const s = content('We built the platform, not the application', 'The application is deliberately small. It is the workload. What we deliver and evaluate is everything around it.');
  text(s, 'TaskBoard, a small React + FastAPI + PostgreSQL app, is only the workload. The deliverable is everything that builds, deploys, scales and recovers it.', { x: 0.6, y: 1.55, w: 12.1, h: 0.8, fontSize: 17, color: GRAY });
  const pillars = [
    ['Infrastructure as code', 'Terraform creates the whole AWS environment and removes it again.'],
    ['Validated changes', 'Every pull request passes tests and security scans before merge.'],
    ['GitOps delivery', 'ArgoCD keeps the cluster identical to Git. No deploy command.'],
    ['Scale and heal', 'Pods follow load and survive the loss of a pod or a node.'],
    ['Observe', 'Prometheus and Grafana show traffic, errors and latency.'],
    ['Secure every layer', 'Controls from the repository to the cloud, each verified by test.'],
  ];
  pillars.forEach(([head, body], i) => {
    const x = 0.6 + (i % 3) * 4.1;
    const y = 2.6 + Math.floor(i / 3) * 2.15;
    card(s, x, y, 3.9, 1.9, TEAL_TINT);
    text(s, head, { x: x + 0.3, y: y + 0.25, w: 3.3, h: 0.4, fontSize: 17, bold: true, color: TEAL });
    text(s, body, { x: x + 0.3, y: y + 0.72, w: 3.3, h: 1.0, fontSize: 14 });
  });
}

// ---- 4. architecture ---------------------------------------------------------

startSection('Design');
{
  const s = content('Everything runs in private subnets behind one load balancer', 'Walk left to right: developer and GitHub on the left, AWS on the right. Only the load balancer and NAT gateway are public. ArgoCD inside the cluster pulls from Git; nothing outside holds cluster credentials.');
  // left column
  box(s, 'Developer', 0.6, 1.7, 2.5, 0.7, TINT, INK, true);
  arrowDown(s, 1.85, 2.4, 0.45);
  box(s, 'GitHub repository\napp / infra / deploy', 0.6, 2.85, 2.5, 0.9, TINT);
  arrowDown(s, 1.85, 3.75, 0.45);
  box(s, 'GitHub Actions\ntests and security scans', 0.6, 4.2, 2.5, 0.9, TINT);
  text(s, 'ArgoCD pulls the desired state from the repository. The pipeline has no access to the cluster.', { x: 0.6, y: 5.35, w: 2.6, h: 1.4, fontSize: 12, color: GRAY });

  // AWS
  card(s, 3.5, 1.6, 9.2, 5.2, TINT);
  text(s, 'AWS  |  eu-north-1', { x: 3.7, y: 1.68, w: 3, h: 0.3, fontSize: 12, bold: true, color: GRAY });
  box(s, 'ECR\nimages', 3.7, 2.45, 1.6, 0.8, WHITE);
  box(s, 'S3\nTerraform state', 3.7, 3.45, 1.6, 0.8, WHITE);
  box(s, 'KMS\nsecrets key', 3.7, 4.45, 1.6, 0.8, WHITE);

  // VPC
  s.addShape(pres.ShapeType.roundRect, { x: 5.55, y: 2.05, w: 6.95, h: 4.55, rectRadius: 0.06, fill: { color: WHITE }, line: { color: 'B6C4C9', width: 1 } });
  text(s, 'VPC 10.0.0.0/16  |  two Availability Zones', { x: 5.7, y: 2.12, w: 5, h: 0.3, fontSize: 12, bold: true, color: GRAY });

  card(s, 5.7, 2.5, 2.0, 3.95, 'FDF1DC');
  text(s, 'Public subnets', { x: 5.8, y: 2.57, w: 1.8, h: 0.3, fontSize: 12, bold: true, color: AMBER });
  box(s, 'Load balancer\nHTTP from users', 5.85, 3.0, 1.7, 0.85, WHITE);
  box(s, 'NAT gateway\noutbound only', 5.85, 5.3, 1.7, 0.85, WHITE);

  card(s, 7.9, 2.5, 4.45, 3.95, TEAL_TINT);
  text(s, 'Private subnets  |  EKS, two nodes', { x: 8.0, y: 2.57, w: 4.2, h: 0.3, fontSize: 12, bold: true, color: TEAL });
  box(s, 'Frontend pods\n2 to 4', 8.1, 3.0, 1.9, 0.85, WHITE);
  box(s, 'Backend pods\n2 to 10', 10.3, 3.0, 1.9, 0.85, WHITE);
  box(s, 'Autoscaler', 8.1, 4.2, 1.9, 0.7, WHITE);
  box(s, 'PostgreSQL\nEBS volume', 10.3, 4.2, 1.9, 0.85, WHITE);
  box(s, 'ArgoCD', 8.1, 5.45, 1.9, 0.75, TEAL, WHITE, true);
  box(s, 'Prometheus\nGrafana', 10.3, 5.45, 1.9, 0.75, TEAL, WHITE, true);

  arrowRight(s, 7.55, 3.42, 0.55);
  arrowRight(s, 10.0, 3.42, 0.3);
  arrowDown(s, 11.25, 3.85, 0.35);
}

// ---- 5. stack ----------------------------------------------------------------

{
  const s = content('One tool per job, each chosen against an alternative', 'Be ready to justify each choice: the defence questions file has an answer for every row.');
  const rows = [
    ['Cloud', 'AWS, Amazon EKS', 'Managed control plane, standard Kubernetes'],
    ['Infrastructure as code', 'Terraform', 'Declarative, cloud-independent, testable'],
    ['Continuous integration', 'GitHub Actions', 'Lives with the repository, no server to run'],
    ['Continuous delivery', 'ArgoCD', 'Pull model: no cluster credentials outside the cluster'],
    ['Manifests', 'Kustomize', 'Plain YAML with small per-environment overlays'],
    ['Monitoring', 'Prometheus, Grafana', 'Same open-source stack locally and on AWS'],
    ['Security scanning', 'Trivy, Gitleaks', 'Images, configuration and Git history'],
    ['Load testing', 'k6', 'Scripted scenarios with pass or fail thresholds'],
  ];
  const head = { bold: true, color: WHITE, fill: { color: TEAL }, fontFace: BODY, fontSize: 14 };
  const table = [
    [{ text: 'Area', options: head }, { text: 'Chosen', options: head }, { text: 'Why', options: head }],
    ...rows.map((r, i) => r.map((c, j) => ({ text: c, options: { fontFace: BODY, fontSize: 14, color: INK, bold: j === 1, fill: { color: i % 2 ? TINT : WHITE } } }))),
  ];
  s.addTable(table, { x: 0.6, y: 1.65, w: 12.1, colW: [3.0, 3.0, 6.1], rowH: 0.54, border: { type: 'solid', color: 'D5DEE1', pt: 0.5 }, margin: [0.05, 0.12, 0.05, 0.12], valign: 'middle' });
}

// ---- 6. delivery flow --------------------------------------------------------

{
  const s = content('A change reaches production by being merged, nothing else', 'Two stages: the pipeline validates, ArgoCD deploys. The pipeline never touches the cluster.');
  image(s, diagram('delivery-flow.png'), 0.6, 1.55, 8.6, 5.25);
  card(s, 9.5, 1.7, 3.2, 4.9, TEAL_TINT);
  text(s, 'Sync order', { x: 9.75, y: 1.9, w: 2.7, h: 0.4, fontSize: 16, bold: true, color: TEAL });
  text(s, [
    { text: 'Namespace', options: { bullet: { type: 'number' }, breakLine: true } },
    { text: 'Configuration and network policies', options: { bullet: { type: 'number' }, breakLine: true } },
    { text: 'Database', options: { bullet: { type: 'number' }, breakLine: true } },
    { text: 'Migration job', options: { bullet: { type: 'number' }, breakLine: true } },
    { text: 'Backend and frontend', options: { bullet: { type: 'number' }, breakLine: true } },
    { text: 'Ingress', options: { bullet: { type: 'number' } } },
  ], { x: 9.75, y: 2.4, w: 2.7, h: 2.9, fontSize: 14, paraSpaceAfter: 6 });
  text(s, 'If the migration fails, the sync stops and the running version stays.', { x: 9.75, y: 5.4, w: 2.7, h: 1.0, fontSize: 13, color: GRAY, italic: true });
}

// ---- 7. CI -------------------------------------------------------------------

startSection('Implementation');
{
  const s = content('No change merges without passing seven checks', 'ci-ok is the only required check; it passes only if all the others passed or were skipped by the path filter.');
  const jobs = [
    ['Secret scan', 'Gitleaks over the full Git history'],
    ['Backend', 'Lint, 86 unit and integration tests'],
    ['Frontend', 'Type check, 29 tests'],
    ['Build and scan', 'Production images, Trivy, end-to-end smoke test'],
    ['Configuration', 'Dockerfiles, manifests and Terraform checked'],
    ['Terraform', 'Format, validate, 25 plan tests on a mocked provider'],
  ];
  jobs.forEach(([head, body], i) => {
    const x = 0.6 + (i % 2) * 4.25;
    const y = 1.7 + Math.floor(i / 2) * 1.6;
    card(s, x, y, 4.05, 1.4);
    badge(s, x + 0.25, y + 0.45, i + 1);
    text(s, head, { x: x + 0.95, y: y + 0.25, w: 2.9, h: 0.35, fontSize: 16, bold: true });
    text(s, body, { x: x + 0.95, y: y + 0.63, w: 2.9, h: 0.65, fontSize: 13, color: GRAY });
  });
  card(s, 9.3, 1.7, 3.4, 4.6, TEAL_TINT);
  stat(s, 9.6, 1.95, 2.9, '103 s', 'median pipeline time over 17 pull requests');
  stat(s, 9.6, 3.6, 2.9, '0', 'cloud credentials held by the pipeline');
  text(s, 'Main branch: pull request required, ci-ok required, rules apply to admins.', { x: 9.6, y: 5.2, w: 2.9, h: 0.95, fontSize: 13, color: INK });
}

// ---- 8. GitOps ---------------------------------------------------------------

{
  const s = content('Git is the only way to change the cluster', 'Screenshot from the AWS session: seven applications, all Synced and Healthy. We changed the cluster by hand and ArgoCD reverted it in 1.5 seconds.');
  image(s, shot('aws-argocd-applications.png'), 0.6, 1.6, 8.3, 4.6);
  text(s, 'ArgoCD on EKS: seven applications created from one root application', { x: 0.6, y: 6.3, w: 8.3, h: 0.3, fontSize: 12, color: GRAY });
  stat(s, 9.3, 1.6, 3.4, '155 s', 'empty cluster to seven healthy applications');
  stat(s, 9.3, 3.25, 3.4, '1.5 s', 'to revert a manual change to the cluster');
  stat(s, 9.3, 4.9, 3.4, '18 s', 'to roll back by reverting a commit');
}

// ---- 9. Terraform ------------------------------------------------------------

{
  const s = content('The whole AWS environment is created from code in 12 minutes', 'The environment was created and destroyed for each session. After destroy we verified ten resource types to confirm nothing billable was left.');
  image(s, shot('aws-console-vpc-resource-map.png'), 4.9, 1.6, 7.8, 4.3);
  text(s, 'The VPC as created by Terraform: subnets, route tables and gateways', { x: 4.9, y: 6.0, w: 7.8, h: 0.3, fontSize: 12, color: GRAY });
  stat(s, 0.6, 1.6, 4.0, '49', 'resources in the platform stack, from 7 reusable modules');
  stat(s, 0.6, 3.2, 4.0, '0', 'changes in the plan after apply, and nothing left after destroy');
  text(s, [
    { text: 'State in encrypted, versioned S3 with locking', options: { bullet: true, breakLine: true } },
    { text: 'Least-privilege role per controller', options: { bullet: true, breakLine: true } },
    { text: 'About 0.40 USD per hour while it exists', options: { bullet: true } },
  ], { x: 0.6, y: 4.85, w: 4.0, h: 1.6, fontSize: 14, paraSpaceAfter: 6 });
}

// ---- 10. security ------------------------------------------------------------

{
  const s = content('Security is applied at eight layers, each verified by a test', 'The point is defence in depth: if one control fails, the next still holds. Every row was tested, not assumed.');
  const layers = [
    ['Repository', 'Pre-commit hook and server-side scanning keep secrets out of Git'],
    ['Build', 'A fixable high or critical vulnerability fails the pipeline'],
    ['Container', 'Non-root user, no build tools in the final image'],
    ['Pod', 'Read-only filesystem, no capabilities, enforced at admission'],
    ['Cluster network', 'Default deny; only four paths opened'],
    ['Cloud network', 'Nodes in private subnets; only the load balancer is public'],
    ['Cloud identity', 'No long-lived keys; one role per controller'],
    ['Data', 'Secrets, volumes and Terraform state encrypted'],
  ];
  layers.forEach(([head, body], i) => {
    const x = 0.6 + (i % 2) * 6.15;
    const y = 1.65 + Math.floor(i / 2) * 1.28;
    card(s, x, y, 5.95, 1.1, i % 4 === 0 || i % 4 === 3 ? TINT : TEAL_TINT);
    badge(s, x + 0.25, y + 0.3, i + 1);
    text(s, head, { x: x + 0.95, y: y + 0.15, w: 4.8, h: 0.35, fontSize: 16, bold: true });
    text(s, body, { x: x + 0.95, y: y + 0.53, w: 4.8, h: 0.5, fontSize: 13, color: GRAY });
  });
}

// ---- 11. network policies ----------------------------------------------------

{
  const s = content('The frontend cannot reach the database, and we proved it', 'Before the policies the same script showed the frontend could open a connection to PostgreSQL. After: blocked. Same result on kind and on EKS, which use different network plugins.');
  image(s, diagram('network-policies.png'), 0.6, 1.6, 12.1, 2.3);
  stat(s, 0.6, 4.3, 3.6, '11 / 11', 'connection checks gave the intended result, on both clusters');
  card(s, 4.6, 4.3, 3.9, 2.3, TEAL_TINT);
  text(s, 'Allowed', { x: 4.85, y: 4.45, w: 3.4, h: 0.35, fontSize: 16, bold: true, color: TEAL });
  text(s, [
    { text: 'Visitors to frontend', options: { bullet: true, breakLine: true } },
    { text: 'Frontend to backend', options: { bullet: true, breakLine: true } },
    { text: 'Backend to database', options: { bullet: true, breakLine: true } },
    { text: 'Prometheus to backend', options: { bullet: true } },
  ], { x: 4.85, y: 4.85, w: 3.4, h: 1.6, fontSize: 14, paraSpaceAfter: 3 });
  card(s, 8.8, 4.3, 3.9, 2.3, 'FBE9E7');
  text(s, 'Blocked', { x: 9.05, y: 4.45, w: 3.4, h: 0.35, fontSize: 16, bold: true, color: RED });
  text(s, [
    { text: 'Frontend to database', options: { bullet: true, breakLine: true } },
    { text: 'Other namespaces to the app', options: { bullet: true, breakLine: true } },
    { text: 'Any pod to the internet', options: { bullet: true } },
  ], { x: 9.05, y: 4.85, w: 3.4, h: 1.6, fontSize: 14, paraSpaceAfter: 3 });
}

// ---- 12. autoscaling ---------------------------------------------------------

startSection('Results');
{
  const s = content('Under load the backend grew from 2 to 10 pods with zero failed requests', 'k6 ramps to 50 virtual users. The graph is the real Grafana panel from the AWS session: ready pods follow the number the autoscaler asks for, then return to 2.');
  image(s, shot('aws-grafana-autoscaling.png'), 0.6, 1.6, 7.6, 3.95);
  text(s, 'Grafana on EKS: pods ready and pods wanted by the autoscaler during the load test', { x: 0.6, y: 5.65, w: 7.6, h: 0.3, fontSize: 12, color: GRAY });
  stat(s, 8.6, 1.5, 4.1, '63,108', 'requests sent, 0 failed, 0 lost writes');
  stat(s, 8.6, 3.05, 4.1, '171 ms', '95th percentile response time (target under 500 ms)');
  stat(s, 8.6, 4.6, 4.1, '164 s', 'to reach 10 pods; back to 2 pods 266 s after the load ended');
  text(s, 'Scale-up is immediate. Scale-down waits three minutes so short dips do not remove capacity.', { x: 0.6, y: 6.1, w: 7.6, h: 0.6, fontSize: 13, color: INK });
}

// ---- 13. resilience ----------------------------------------------------------

{
  const s = content('Losing a whole virtual machine cost 0.57% of requests', 'The chart shows failed requests in each drill. The tall bar is the defect we found locally: both backend pods were on the node we stopped. After the fix the same drill is 3.5% locally and 0.57% on AWS, where the load balancer removes dead targets in seconds.');
  s.addChart(pres.charts.BAR, [{
    name: 'Failed requests (%)',
    labels: ['Pod deleted (AWS)', 'Full rollout (AWS)', 'Node terminated (AWS)', 'Node stopped (local, after fix)', 'Node stopped (local, before fix)'],
    values: [0, 0, 0.57, 3.5, 15.8],
  }], {
    x: 0.6, y: 1.6, w: 7.8, h: 5.1, barDir: 'bar',
    chartColors: [TEAL],
    showTitle: true, title: 'Failed requests per drill (%)', titleFontFace: BODY, titleFontSize: 14, titleColor: INK,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontFace: BODY, dataLabelFontSize: 12, dataLabelColor: INK, dataLabelFormatCode: '0.00',
    catAxisLabelFontFace: BODY, catAxisLabelFontSize: 12, catAxisLabelColor: INK, catAxisOrientation: 'maxMin',
    valAxisLabelFontFace: BODY, valAxisLabelFontSize: 11, valAxisLabelColor: GRAY, valAxisMaxVal: 18,
    valGridLine: { color: 'E2E8EA', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: false,
  });
  stat(s, 8.8, 1.6, 3.9, '30 s', 'to full capacity after a node was terminated on AWS');
  stat(s, 8.8, 3.2, 3.9, '0 of 305', 'requests failed while every pod was replaced');
  text(s, 'Spread across nodes, disruption budgets, 30-second eviction and a delay before shutdown.', { x: 8.8, y: 4.9, w: 3.9, h: 1.2, fontSize: 14, color: GRAY });
}

// ---- 14. defects -------------------------------------------------------------

{
  const s = content('Testing by failure found three defects that health checks missed', 'This is the most important lesson. In all three cases every pod was Running and Ready while users saw errors.');
  const defects = [
    ['Proxy cached the backend address', 'After a Service was recreated, every API request timed out.', 'Resolve the name per request.', 'Service back 2 s after recreation'],
    ['Pods exited while still receiving traffic', '4 of 192 requests failed during a rollout.', 'Wait before shutdown.', '0 failed of 305'],
    ['Both backend pods on one node', 'Stopping that node removed the backend for 85 s.', 'Descheduler restores the spread.', '15.8% failed, now 0.57% on AWS'],
  ];
  defects.forEach(([head, symptom, fix, after], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.7, 3.9, 4.9);
    badge(s, x + 0.3, 1.95, i + 1, RED);
    text(s, head, { x: x + 0.3, y: 2.6, w: 3.3, h: 0.8, fontSize: 17, bold: true });
    text(s, 'SYMPTOM', { x: x + 0.3, y: 3.45, w: 3.3, h: 0.25, fontSize: 11, bold: true, color: RED, charSpacing: 2 });
    text(s, symptom, { x: x + 0.3, y: 3.72, w: 3.3, h: 0.75, fontSize: 14 });
    text(s, 'FIX', { x: x + 0.3, y: 4.5, w: 3.3, h: 0.25, fontSize: 11, bold: true, color: TEAL, charSpacing: 2 });
    text(s, fix, { x: x + 0.3, y: 4.77, w: 3.3, h: 0.5, fontSize: 14 });
    text(s, after, { x: x + 0.3, y: 5.45, w: 3.3, h: 0.9, fontFace: HEAD, fontSize: 18, bold: true, color: TEAL });
  });
}

// ---- 15. criteria ------------------------------------------------------------

{
  const s = content('21 of 29 acceptance criteria met, and every gap has a named cause', 'The criteria were written before implementation. We report the ones we missed as openly as the ones we met.');
  s.addChart(pres.charts.DOUGHNUT, [{
    name: 'Criteria',
    labels: ['Met', 'Partly met', 'Not met', 'Not measured'],
    values: [21, 4, 1, 3],
  }], {
    x: 0.6, y: 1.6, w: 5.2, h: 5.1, holeSize: 55,
    chartColors: [TEAL, AMBER, RED, '9AA8AE'],
    showLegend: true, legendPos: 'b', legendFontFace: BODY, legendFontSize: 13, legendColor: INK,
    showPercent: false, showValue: true, dataLabelFontFace: BODY, dataLabelFontSize: 14, dataLabelColor: WHITE,
    showTitle: false,
  });
  const gaps = [
    ['Partly met (4)', 'Publishing images and building the environment need one manual step: the cloud account forbids the identity provider the pipeline needs. One dashboard instead of four.', AMBER],
    ['Not met (1)', 'HTTPS. A certificate needs a domain name, and the project has none.', RED],
    ['Not measured (3)', 'Node auto-scaling (account quota of two nodes), a two-hour soak, and a timed manual-deployment comparison.', GRAY],
  ];
  gaps.forEach(([head, body, color], i) => {
    const y = 1.7 + i * 1.7;
    card(s, 6.2, y, 6.5, 1.5);
    text(s, head, { x: 6.45, y: y + 0.15, w: 6.0, h: 0.35, fontSize: 16, bold: true, color });
    text(s, body, { x: 6.45, y: y + 0.55, w: 6.0, h: 0.9, fontSize: 13 });
  });
}

// ---- 16. limitations and future work ----------------------------------------

startSection('Conclusion');
{
  const s = content('What is missing today is what we would build next', 'Each limitation on the left has its next step on the right.');
  const pairs = [
    ['HTTP only', 'Register a domain, issue a certificate, redirect to HTTPS'],
    ['Images pushed by a script', 'Standard account, pipeline role, fully automatic path'],
    ['Single database pod, no backup', 'Managed database across two zones'],
    ['Two nodes at most', 'Node autoscaler and a cluster scaling test'],
    ['Alerts are not delivered', 'Send alerts to email or chat; external uptime probe'],
  ];
  text(s, 'LIMITATION', { x: 0.6, y: 1.6, w: 5.4, h: 0.3, fontSize: 12, bold: true, color: RED, charSpacing: 2 });
  text(s, 'NEXT STEP', { x: 7.0, y: 1.6, w: 5.7, h: 0.3, fontSize: 12, bold: true, color: TEAL, charSpacing: 2 });
  pairs.forEach(([lim, next], i) => {
    const y = 2.0 + i * 0.95;
    card(s, 0.6, y, 5.4, 0.8, 'FBE9E7');
    text(s, lim, { x: 0.85, y, w: 4.9, h: 0.8, fontSize: 15, bold: true, valign: 'middle' });
    arrowRight(s, 6.15, y + 0.4, 0.7);
    card(s, 7.0, y, 5.7, 0.8, TEAL_TINT);
    text(s, next, { x: 7.25, y, w: 5.2, h: 0.8, fontSize: 15, valign: 'middle' });
  });
}

// ---- 17. conclusion ----------------------------------------------------------

{
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: section });
  text(s, 'A platform should be judged by what users see when things fail', { x: 0.8, y: 0.8, w: 11.7, h: 1.7, fontFace: HEAD, fontSize: 36, bold: true, color: WHITE });
  const facts = [
    ['12 min', 'environment from code'],
    ['0', 'manual deploy commands'],
    ['2 to 10', 'pods under load, 0 failed'],
    ['0.57%', 'failed when a node died'],
  ];
  facts.forEach(([value, label], i) => {
    const x = 0.8 + i * 3.0;
    text(s, value, { x, y: 2.9, w: 2.8, h: 0.9, fontFace: HEAD, fontSize: 38, bold: true, color: '7FD1C4', valign: 'middle' });
    text(s, label, { x, y: 3.8, w: 2.8, h: 0.6, fontSize: 15, color: 'CFE3E0' });
  });
  text(s, 'Thank you. Questions?', { x: 0.8, y: 5.1, w: 8, h: 0.6, fontFace: HEAD, fontSize: 26, bold: true, color: WHITE });
  text(s, 'github.com/Ahmed-Sabry11/taskboard-platform', { x: 0.8, y: 5.85, w: 8, h: 0.4, fontSize: 16, color: 'CFE3E0' });
  s.addNotes('Close on the lesson, then offer the live demo on the local cluster: change a replica count by hand and watch ArgoCD revert it.');
}

pres.writeFile({ fileName: path.join(__dirname, 'TaskBoard-Presentation.pptx') }).then((f) => console.log(`wrote ${f}`));
