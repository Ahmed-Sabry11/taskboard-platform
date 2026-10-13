// Generates the project book as a Word document.
//
//   docker run --rm -v "${PWD}:/repo" -w /repo/docs/book node:24-alpine \
//     sh -c "npm install --no-save docx@9 >/dev/null 2>&1 && node build-book.js"
//
// Text in [square brackets] is a placeholder for the team to fill in.

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
  TableOfContents, Header, Footer, PageNumber, LevelFormat, TabStopType,
} = require('docx');

const SHOTS = path.join(__dirname, '..', 'evaluation', 'screenshots');
const DIAGRAMS = path.join(__dirname, 'diagrams');
const CONTENT_WIDTH = 9026; // A4 width minus 1 inch margins, in DXA
const BODY_FONT = 'Times New Roman';
const HEAD_FONT = 'Arial';
const MONO_FONT = 'Consolas';

const children = [];
let chapter = 0;
let figureNo = 0;
let tableNo = 0;

// ---- helpers -----------------------------------------------------------------

function run(text, opts = {}) {
  return new TextRun({ text, font: BODY_FONT, size: 24, ...opts });
}

// Supports **bold** and `code` inside a paragraph.
function inline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith('**')) return run(part.slice(2, -2), { bold: true });
    if (part.startsWith('`')) return run(part.slice(1, -1), { font: MONO_FONT, size: 21 });
    return run(part);
  });
}

function P(text, opts = {}) {
  children.push(new Paragraph({
    children: inline(text),
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 336 },
    ...opts.para,
  }));
}

function H1(text, numbered = true) {
  if (numbered) { chapter += 1; figureNo = 0; tableNo = 0; }
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: numbered ? `Chapter ${chapter}: ${text}` : text, font: HEAD_FONT, size: 36, bold: true })],
    spacing: { before: 240, after: 280 },
  }));
}

function H2(text) {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: HEAD_FONT, size: 28, bold: true })],
    spacing: { before: 280, after: 140 },
    keepNext: true,
  }));
}

function H3(text) {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, font: HEAD_FONT, size: 24, bold: true })],
    spacing: { before: 200, after: 100 },
    keepNext: true,
  }));
}

function B(items) {
  for (const item of items) {
    children.push(new Paragraph({
      children: inline(item),
      numbering: { reference: 'bullets', level: 0 },
      spacing: { after: 80, line: 312 },
    }));
  }
}

function N(items) {
  for (const item of items) {
    children.push(new Paragraph({
      children: inline(item),
      numbering: { reference: 'numbers', level: 0 },
      spacing: { after: 80, line: 312 },
    }));
  }
  // Restart numbering for the next list by switching instance.
  numberInstance += 1;
}
let numberInstance = 0;

function CODE(lines) {
  for (const line of lines) {
    children.push(new Paragraph({
      children: [new TextRun({ text: line || ' ', font: MONO_FONT, size: 19 })],
      shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
      spacing: { after: 0, line: 260 },
      indent: { left: 200 },
    }));
  }
  children.push(new Paragraph({ children: [], spacing: { after: 160 } }));
}

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, header) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    shading: header ? { type: ShadingType.CLEAR, fill: 'D9E2F3' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      children: inline(String(text)).map((r) => r),
      spacing: { after: 0, line: 276 },
      alignment: AlignmentType.LEFT,
    })],
  });
}

function T(caption, headers, rows, ratios) {
  tableNo += 1;
  const total = (ratios || headers.map(() => 1)).reduce((a, b) => a + b, 0);
  const widths = (ratios || headers.map(() => 1)).map((r) => Math.floor((CONTENT_WIDTH * r) / total));
  widths[widths.length - 1] += CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);

  children.push(new Paragraph({
    children: [run(chapter === 0 ? caption : `Table ${chapter}.${tableNo}: ${caption}`, { bold: true, size: 22 })],
    spacing: { before: 160, after: 80 },
    keepNext: true,
  }));
  children.push(new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(`**${h}**`, widths[i], true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], false)) })),
    ],
  }));
  children.push(new Paragraph({ children: [], spacing: { after: 200 } }));
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), data: buf };
}

function FIG(file, caption, maxWidth = 600, maxHeight = 640) {
  figureNo += 1;
  const { width, height, data } = pngSize(file);
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { before: 160, after: 80 },
    children: [new ImageRun({
      type: 'png',
      data,
      transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
    })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(`Figure ${chapter}.${figureNo}: ${caption}`, { bold: true, size: 22 })],
    spacing: { after: 240 },
  }));
}

const shot = (name) => path.join(SHOTS, name);
const diagram = (name) => path.join(DIAGRAMS, name);

function centered(text, opts = {}) {
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(text, opts)],
    spacing: { after: opts.after ?? 200 },
  }));
}

// ---- title page --------------------------------------------------------------

centered('[University Name]', { size: 32, bold: true, after: 80 });
centered('[Faculty / Institute Name]', { size: 28, after: 80 });
centered('[Department Name]', { size: 28, after: 900 });
centered('Graduation Project', { size: 28, after: 300 });
centered('Design and Implementation of a Secure, Auto-Scaling Multi-Service Infrastructure Using GitOps and Kubernetes', { size: 40, bold: true, after: 300 });
centered('Project Code: GPJ2617', { size: 24, after: 900 });
centered('Submitted by', { size: 24, bold: true, after: 120 });
centered('[Student Name 1]    [Student ID]', { size: 24, after: 60 });
centered('[Student Name 2]    [Student ID]', { size: 24, after: 60 });
centered('[Student Name 3]    [Student ID]', { size: 24, after: 60 });
centered('[Student Name 4]    [Student ID]', { size: 24, after: 600 });
centered('Supervised by', { size: 24, bold: true, after: 120 });
centered('[Supervisor Name and Title]', { size: 24, after: 900 });
centered('[Academic Year]', { size: 24 });

// ---- front matter ------------------------------------------------------------

H1('Abstract', false);
P('This graduation project presents the design and implementation of an automated, highly available, and secure infrastructure deployment pipeline built on modern DevOps and GitOps practice. The deliverable is the platform rather than an application: a small task-management application, TaskBoard, built with React, FastAPI, and PostgreSQL, serves as the workload that the platform builds, deploys, scales, and recovers.');
P('The infrastructure is defined as code with Terraform and provisioned on Amazon Web Services: a virtual private cloud with public and private subnets across two Availability Zones, least-privilege identity roles, a container registry, and an Amazon EKS Kubernetes cluster. A continuous integration pipeline on GitHub Actions validates every change with unit and integration tests, container vulnerability scanning, secret scanning, and configuration checks. Continuous delivery follows the GitOps model: ArgoCD runs inside the cluster and keeps the live environment identical to the declarative configuration held in Git. Horizontal pod autoscaling handles variable load, and Prometheus with Grafana provide metrics, dashboards, and alerts.');
P('The platform was evaluated against 29 acceptance criteria defined before implementation. Twenty-one were met. On AWS, a full environment was created from code in about 17 minutes; ArgoCD deployed all applications to an empty cluster in 155 seconds; a load test of 63,108 requests completed with no failed requests and a 95th percentile response time of 171 ms while the backend scaled from 2 to 10 replicas; terminating a virtual machine under load caused 0.57% of requests to fail, with full capacity restored in 30 seconds; and manual changes to the cluster were reverted in 1.5 seconds. Testing also exposed three defects that health checks did not reveal, each of which was corrected and re-measured. The criteria that were not met are traced to specific causes, chiefly restrictions of the cloud account used and the absence of a domain name.');
P('**Keywords:** DevOps, GitOps, Kubernetes, Infrastructure as Code, Terraform, Amazon EKS, ArgoCD, Continuous Integration, Auto-scaling, Observability.');

H1('Acknowledgements', false);
P('[To be written by the team.]');

H1('Table of Contents', false);
children.push(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }));
P('If the table above is empty, right-click it in Microsoft Word and choose Update Field.', { align: AlignmentType.LEFT });

H1('List of Abbreviations', false);
T('Abbreviations', ['Abbreviation', 'Meaning'], [
  ['ALB', 'Application Load Balancer'],
  ['API', 'Application Programming Interface'],
  ['AWS', 'Amazon Web Services'],
  ['CD', 'Continuous Delivery'],
  ['CI', 'Continuous Integration'],
  ['CRUD', 'Create, Read, Update, Delete'],
  ['EBS', 'Elastic Block Store'],
  ['ECR', 'Elastic Container Registry'],
  ['EKS', 'Elastic Kubernetes Service'],
  ['HPA', 'Horizontal Pod Autoscaler'],
  ['IaC', 'Infrastructure as Code'],
  ['IAM', 'Identity and Access Management'],
  ['KMS', 'Key Management Service'],
  ['NAT', 'Network Address Translation'],
  ['OIDC', 'OpenID Connect'],
  ['PR', 'Pull Request'],
  ['VPC', 'Virtual Private Cloud'],
  ['YAML', 'YAML Ain\'t Markup Language'],
], [1, 3]);

// ---- chapter 1 ---------------------------------------------------------------

H1('Introduction');
H2('1.1 Background');
P('Software is delivered today far more often than it was a decade ago. Organisations that once released a few times a year now release many times a day. That pace is only possible when the steps between writing code and running it in production are automated, repeatable, and observable. The practices that make this possible are grouped under the name DevOps, and its tooling has converged on a recognisable set: containers to package software, Kubernetes to run it, infrastructure as code to create the environment, pipelines to validate every change, and monitoring to show what is happening.');
P('GitOps is a refinement of these practices. It treats a Git repository as the single source of truth for both the application and the environment it runs in. A controller inside the cluster continuously compares the live state with the repository and corrects any difference. Deployment becomes a matter of merging a change; rollback becomes a matter of reverting one.');
H2('1.2 Problem Statement');
P('Deploying a multi-service application by hand has well-known weaknesses. It is slow and depends on particular individuals. Each manual step is an opportunity for error, and there is rarely a reliable record of what was changed, when, and by whom. Environments drift apart because fixes are applied directly to servers. Capacity is fixed, so a surge in traffic degrades or stops the service. Failures are discovered when users report them. Security controls are applied inconsistently because they depend on someone remembering to apply them.');
P('The problem this project addresses is how to design and build an infrastructure and delivery pipeline in which these weaknesses are removed by construction: where the environment is created from code, every change is validated automatically, deployment requires no manual intervention, capacity follows demand, failures are recovered automatically, and security is enforced at every layer.');
H2('1.3 Objectives');
B([
  'Define the complete cloud infrastructure as code so that it can be created and destroyed on demand.',
  'Package a multi-service application in hardened container images.',
  'Build a continuous integration pipeline that blocks defective or vulnerable changes before they are merged.',
  'Deliver the application to Kubernetes with a pull-based GitOps workflow that needs no manual deployment step.',
  'Scale the application automatically with load and keep it available through pod and node failures.',
  'Provide metrics, dashboards, and alerts for the running system.',
  'Apply security controls at every layer and verify each one by test.',
  'Evaluate the result against measurable acceptance criteria defined in advance.',
]);
H2('1.4 Scope');
P('The project delivers the platform. The application that runs on it is deliberately small: a task-management system with one database table and a REST interface. It was chosen because it is the smallest workload that still exercises everything the platform must handle: a stateless service that can be replicated, a database behind a network boundary, schema migrations on every release, and health endpoints. User authentication, a managed database service, and multi-region deployment are outside the scope.');
H2('1.5 Methodology');
P('The work followed an incremental approach in nine milestones. The architecture, the design decisions, and the acceptance criteria were written first. Each milestone was then proven locally before any cloud resource was used: the application under Docker Compose, then on a local Kubernetes cluster, then under ArgoCD. Only what required the cloud was done on AWS, in short sessions that ended with the environment being destroyed. Every change entered the repository through a pull request that had to pass the pipeline. Each milestone ended with measurements, and where a measurement exposed a defect, the defect was fixed and the measurement repeated.');
H2('1.6 Report Organisation');
P('Chapter 2 reviews the technologies used and the alternatives considered. Chapter 3 presents the requirements and the design. Chapter 4 describes the implementation. Chapter 5 reports the tests and their results. Chapter 6 concludes and identifies limitations and future work.');

// ---- chapter 2 ---------------------------------------------------------------

H1('Background and Technology Review');
H2('2.1 Containers and Docker');
P('A container packages an application with its libraries and runtime into a single image that runs the same way on any host. Unlike a virtual machine, a container shares the kernel of its host, which makes it small and quick to start. Docker is the most widely used tool for building and running containers. A Dockerfile describes how an image is built. Multi-stage builds separate the tools needed to build the software from the files needed to run it, which keeps the final image small and reduces what an attacker could use.');
H2('2.2 Kubernetes');
P('Kubernetes is an orchestrator: it runs containers across a group of machines and keeps them in the state that has been declared. The basic unit is the pod, one or more containers that run together. A Deployment keeps a given number of identical pods running and replaces them gradually during an update. A Service gives a set of pods a stable address. An Ingress exposes a Service to the outside. Kubernetes restarts containers that fail, moves pods away from failed machines, and can change the number of pods in response to load through the Horizontal Pod Autoscaler.');
H2('2.3 Infrastructure as Code and Terraform');
P('Infrastructure as code means describing servers, networks, and permissions in text files rather than creating them by hand. The description can be reviewed, versioned, tested, and applied repeatedly with the same result. Terraform is a declarative tool for this purpose: the engineer states what should exist, and Terraform computes and performs the changes needed. It records what it has created in a state file, which in this project is kept in encrypted, versioned cloud storage with a lock that prevents concurrent changes.');
H2('2.4 Continuous Integration');
P('Continuous integration is the practice of validating every change automatically as soon as it is proposed. A pipeline builds the software, runs its tests, and applies quality and security checks. When the pipeline is a required condition for merging, a defective change cannot reach the main branch. GitHub Actions provides this as part of the repository hosting service.');
H2('2.5 GitOps and ArgoCD');
P('In a push-based delivery model, the pipeline holds credentials for the production environment and applies changes to it. In the pull-based model used by GitOps, an agent inside the environment reads the desired state from Git and applies it. No external system holds credentials for the cluster, and the cluster corrects itself whenever it diverges from Git. ArgoCD is a widely adopted GitOps controller for Kubernetes. It supports ordering a deployment in waves, running jobs at defined points, and composing many applications from one root definition.');
H2('2.6 Observability');
P('A system cannot be operated reliably without knowing what it is doing. Prometheus collects numerical metrics from applications and infrastructure at regular intervals, stores them as time series, and evaluates alert rules. Grafana presents the metrics as dashboards. Together they answer the operational questions that matter: how much traffic is being served, how fast, with how many errors, and with what resources.');
H2('2.7 Technology Selection');
T('Technologies selected and alternatives considered', ['Area', 'Selected', 'Alternatives', 'Reason'], [
  ['Cloud', 'Amazon Web Services', 'Azure, Google Cloud', 'Widest adoption and documentation'],
  ['Orchestration', 'Amazon EKS', 'Self-managed Kubernetes, ECS', 'Managed control plane, standard Kubernetes'],
  ['Infrastructure as code', 'Terraform', 'CloudFormation, Pulumi', 'Cloud-independent and declarative'],
  ['Continuous integration', 'GitHub Actions', 'Jenkins, GitLab CI', 'Integrated with the repository, no server to run'],
  ['Continuous delivery', 'ArgoCD', 'Flux, pipeline push', 'Pull model, visual interface, sync ordering'],
  ['Manifests', 'Kustomize', 'Helm for own application', 'Plain YAML, simple per-environment changes'],
  ['Pod permissions', 'EKS Pod Identity', 'IAM Roles for Service Accounts', 'Needs no OIDC provider in the account'],
  ['Monitoring', 'Prometheus and Grafana', 'CloudWatch, managed services', 'Open source, same stack locally and on AWS'],
  ['Load testing', 'k6', 'JMeter, Locust', 'Scriptable, thresholds as pass criteria'],
], [2, 2, 2.5, 3]);

// ---- chapter 3 ---------------------------------------------------------------

H1('System Analysis and Design');
H2('3.1 Requirements');
T('Functional requirements', ['ID', 'Requirement'], [
  ['FR1', 'Create the complete cloud environment from code, and destroy it, without using the cloud console.'],
  ['FR2', 'Validate every proposed change automatically: tests, vulnerability scan, secret scan, configuration checks.'],
  ['FR3', 'Deploy any change merged to the main branch without a manual deployment command.'],
  ['FR4', 'Revert a manual change to the cluster automatically.'],
  ['FR5', 'Roll back a release by reverting a commit.'],
  ['FR6', 'Increase and decrease the number of application replicas with load.'],
  ['FR7', 'Collect metrics, show them on dashboards, and raise alerts.'],
  ['FR8', 'Serve the application to users through a single public entry point.'],
], [1, 8]);
T('Non-functional requirements', ['Category', 'Requirement'], [
  ['Availability', 'No failed requests during a rollout. Service continues through the loss of a pod or a node.'],
  ['Performance', '95th percentile response time under 500 ms and under 1% errors at peak load.'],
  ['Security', 'No secrets in Git. Non-root containers. Database unreachable except from the backend. Least-privilege cloud permissions.'],
  ['Reproducibility', 'The same code produces the same environment on every run, with no drift afterwards.'],
  ['Cost', 'The environment can be removed completely between sessions.'],
  ['Maintainability', 'Every change is reviewed, traceable to a commit, and documented.'],
], [2, 7]);
H2('3.2 Architecture Overview');
P('The system has three parts. The repository on GitHub holds the application source, the Terraform code, and the Kubernetes manifests, and runs the pipeline. The AWS account holds the network, the container registry, and the EKS cluster. Inside the cluster run the application, ArgoCD, and the monitoring stack. Figure 3.1 shows how they relate.');
FIG(diagram('architecture.png'), 'System architecture as implemented', 420, 660);
H2('3.3 Application Components');
T('Application components', ['Component', 'Technology', 'Responsibility', 'Replicas'], [
  ['Frontend', 'React, served by NGINX', 'User interface. Forwards `/api` requests to the backend.', '2 to 4'],
  ['Backend', 'FastAPI, SQLAlchemy', 'REST interface for tasks, health endpoints, metrics', '2 to 10'],
  ['Database', 'PostgreSQL 16', 'Stores tasks', '1'],
  ['Migration job', 'Alembic', 'Brings the database schema up to date before each release', 'Runs once'],
], [2, 2.5, 4.5, 1.5]);
P('The backend exposes two health endpoints with different purposes. The liveness endpoint reports only that the process is running; if it fails, Kubernetes restarts the container. The readiness endpoint also checks the database connection; if it fails, Kubernetes stops sending traffic to that pod without restarting it. The separation is deliberate: a database outage must not cause every healthy backend pod to be restarted.');
H2('3.4 Network Design');
P('The virtual private cloud spans two Availability Zones and has two tiers of subnets. Public subnets hold only the load balancer and the NAT gateway. Private subnets hold the worker nodes and all pods; they have no public addresses and cannot be reached from the internet. Outbound traffic from the private subnets leaves through the NAT gateway.');
T('Subnet design', ['Tier', 'Address ranges', 'Contains', 'Internet access'], [
  ['Public', '10.0.0.0/24, 10.0.1.0/24', 'Load balancer, NAT gateway', 'Inbound to the load balancer only'],
  ['Private', '10.0.16.0/20, 10.0.32.0/20', 'Worker nodes and pods', 'Outbound only, through NAT'],
], [1.5, 3, 3, 3]);
H2('3.5 Security Design');
P('Security is applied in layers so that the failure of one control does not expose the system.');
T('Security controls by layer', ['Layer', 'Controls'], [
  ['Repository', 'Ignore rules, a pre-commit hook, and server-side scanning keep credentials out of Git. The main branch accepts changes only through reviewed pull requests.'],
  ['Build', 'Images are scanned. A fixable high or critical vulnerability fails the pipeline.'],
  ['Container', 'Non-root user, no build tools in the final image.'],
  ['Pod', 'Read-only root filesystem, no Linux capabilities, no privilege escalation, no Kubernetes API token. Enforced at admission.'],
  ['Cluster network', 'Default deny, with only the paths the application needs opened.'],
  ['Cloud network', 'Nodes in private subnets. The load balancer may reach two pod ports only.'],
  ['Cloud identity', 'Least-privilege roles. No long-lived access keys. One role per controller, bound to one service account.'],
  ['Data', 'Kubernetes Secrets encrypted with a managed key. Encrypted volumes. Encrypted, versioned, private state storage.'],
], [2, 7.5]);
H2('3.6 Delivery Flow');
P('A change reaches production in two stages. The pipeline validates it and, once it passes, the change may be merged. ArgoCD then notices the new commit and applies it. The pipeline has read-only access to the repository and no access to the cluster.');
FIG(diagram('delivery-flow.png'), 'Delivery flow from pull request to running pods', 600, 320);
H2('3.7 Key Design Decisions');
T('Architecture decisions', ['Decision', 'Choice', 'Consequence'], [
  ['Workload', 'A small task-management application', 'Minimal application effort; synthetic load profile'],
  ['Delivery model', 'Pull-based GitOps with ArgoCD', 'No cluster credentials outside the cluster; Git history is the deployment log'],
  ['Repository layout', 'One repository split into application, infrastructure, and deployment', 'Simple to review; pipelines filtered by path'],
  ['Environment lifetime', 'Created per session and destroyed afterwards', 'Low cost; repeated rebuilds prove the code'],
  ['Stack separation', 'State storage, registry, and platform in separate Terraform stacks', 'Images survive while the expensive resources are removed'],
  ['Secrets', 'Created outside Git; Git holds references only', 'One manual command per environment'],
  ['Scaling signal', 'CPU utilisation', 'Simple and dependency-free; an indirect signal for an I/O-bound service'],
  ['Database', 'A single pod inside the cluster', 'Simple and cheap; no redundancy'],
], [2, 3.5, 4]);
H2('3.8 Acceptance Criteria');
P('Twenty-nine measurable criteria were defined before implementation, in seven groups: infrastructure as code, continuous integration, continuous delivery and GitOps, scaling, resilience, security, and observability. Each has a numeric target and a stated method of measurement. Chapter 5 reports the result for every one.');

// ---- chapter 4 ---------------------------------------------------------------

H1('Implementation');
H2('4.1 Repository and Workflow');
P('The repository is divided by who applies a change. The `app` directory is built into images by the pipeline. The `infra` directory is applied by Terraform. The `deploy` directory is applied by ArgoCD. This separation lets each pipeline job run only when its own files change, and lets a reviewer tell from a path what a change can affect.');
P('Development follows a trunk-based model. The main branch is protected: it accepts changes only through pull requests, requires the pipeline to pass, and applies these rules to administrators as well. Commit messages follow the Conventional Commits format, enforced by a local hook. A second hook rejects any commit that contains a credential file or text that resembles a secret.');
H2('4.2 The Application');
P('The backend is a FastAPI service with five task endpoints and two health endpoints. Input is validated three times: in the form, in the API schema, and by database constraints. Configuration is read from environment variables, and any unset value defaults to the safest behaviour. The frontend is a React single-page application served as static files by an unprivileged NGINX, which also forwards API requests so that the user interface and the API share one origin.');
P('The backend has 86 automated tests. Unit tests need no database. Integration tests run against a real PostgreSQL instance whose schema is built by the same migrations used in production. The frontend has 29 tests, including tests of the whole interface against an in-memory server that follows the API contract.');
H2('4.3 Containerisation');
P('Both images use multi-stage builds. The backend image contains only the Python runtime, a virtual environment, and the source; the package installer is removed from it. The frontend image contains only NGINX and the compiled static files and has no Node.js. Both run as non-root users. A Docker Compose file provides a complete local stack with two separate networks, so that the frontend container has no network path to the database, a rule later reproduced in Kubernetes.');
H2('4.4 Continuous Integration Pipeline');
P('The pipeline runs on every pull request. A first job determines which areas of the repository changed, and the remaining jobs run only where relevant.');
T('Pipeline jobs', ['Job', 'Checks'], [
  ['Secret scan', 'Gitleaks over the complete Git history'],
  ['Backend', 'Lint, unit tests, integration tests against PostgreSQL'],
  ['Frontend', 'Type checking, unit and integration tests'],
  ['Build, scan, smoke test', 'Builds the production images, scans them with Trivy, starts the whole stack, and runs an end-to-end test'],
  ['Configuration', 'Scans Dockerfiles, manifests, and Terraform for misconfigurations; renders and validates every Kubernetes overlay'],
  ['Terraform', 'Format check, validation of every stack, plan tests against a mocked provider'],
  ['ci-ok', 'Passes only if every job above passed or was skipped. This is the single required check.'],
], [2.5, 7]);
P('The pipeline holds no cloud credentials. Terraform is validated without contacting AWS: 25 plan tests run against a mocked provider and check, for example, that the cluster endpoint is restricted and that worker nodes receive pull-only registry access.');
H2('4.5 Kubernetes Manifests');
P('The manifests are organised with Kustomize. A base holds everything common to all environments: the Deployments, Services, migration job, autoscalers, disruption budgets, and network policies. An overlay for each environment changes only what must differ. The local overlay uses locally built images and a node port. The AWS overlay uses images from the registry tagged with a Git commit, adds an Ingress for the load balancer, and lengthens the shutdown delay.');
P('Every workload sets resource requests and limits, a liveness and a readiness probe, a non-root user, a read-only root filesystem, and no capabilities. The namespace enforces the restricted Pod Security level, so a pod that violates these rules is refused by the cluster.');
H2('4.6 GitOps with ArgoCD');
P('ArgoCD is installed at a pinned version. One root application is applied by hand; it creates every other application from definitions in Git. On AWS these are the application itself, the load balancer controller, the storage class, the monitoring stack, the monitoring definitions, and the descheduler.');
P('The order of a deployment is controlled with sync waves. ArgoCD applies the namespace first, then configuration and network policies, then the database, then the migration job, and finally the backend and frontend, waiting for each wave to become healthy. If the migration fails, the synchronisation stops and the running version is left untouched. Automated synchronisation with pruning and self-healing is enabled, so a manual change to the cluster is reverted.');
FIG(shot('aws-argocd-applications.png'), 'ArgoCD on EKS: all seven applications Synced and Healthy, tracking the main branch');
H2('4.7 AWS Infrastructure with Terraform');
P('The Terraform code consists of seven reusable modules and three stacks. The modules are network, identity roles, cluster, registry, pod identity, security groups, and a role for the pipeline. The stacks are deployable units with separate state: one for the state bucket, one for the registry, and one for the platform. The platform stack creates 49 resources.');
T('Terraform stacks', ['Stack', 'Contents', 'Lifetime'], [
  ['state-backend', 'Encrypted, versioned storage bucket for Terraform state', 'Permanent'],
  ['persistent', 'Two image repositories with scanning and lifecycle rules', 'Kept between sessions'],
  ['platform', 'Network, roles, encryption key, cluster, node group, add-ons', 'Created per session, then destroyed'],
], [2, 5.5, 2.5]);
P('The cluster uses access entries for authorisation, restricts its public endpoint to one address, encrypts Secrets with a managed key that rotates, and sends audit logs to a log group with a seven-day retention. The two controllers that call AWS, the storage driver and the load balancer controller, each receive their own role through EKS Pod Identity, usable only by one service account. Worker nodes can pull images but cannot push or delete them.');
FIG(shot('aws-console-vpc-resource-map.png'), 'The VPC as created: public and private subnets in two zones, route tables, and gateways');
P('The account available for the project was an AWS free plan account, which imposed restrictions that were discovered during deployment: a single region, a short list of permitted instance types, a quota of five virtual CPUs, and a policy forbidding OIDC identity providers. The code accommodates each through variables. The last restriction means the pipeline cannot obtain AWS credentials, so images are pushed by a script rather than by the pipeline.');
H2('4.8 Observability');
P('The backend exposes Prometheus metrics for request counts and durations, labelled by route template so that the number of series does not grow with the data. The metrics path is outside the API prefix and is therefore not reachable through the load balancer. Health-check and scrape requests are excluded so that they do not hide real traffic.');
P('The monitoring stack is deployed by ArgoCD from a pinned chart. A second application ships the project\'s own definitions: what to scrape, eight alert rules, and a fourteen-panel Grafana dashboard stored in Git. The Grafana login is read from a Secret created outside Git, so the chart\'s well-known default password does not work.');
H2('4.9 Auto-scaling and Resilience');
P('A Horizontal Pod Autoscaler keeps the backend between 2 and 10 replicas, adding pods when average CPU utilisation exceeds 60% of the request. Scale-up is immediate; scale-down waits for three minutes of low load and removes at most half the pods per minute. The replica count was removed from the manifests, because a fixed number in Git would cause ArgoCD to undo every scaling decision.');
P('Several mechanisms protect availability. Replicas are spread across nodes when scheduled, and a descheduler restores the spread when it is lost. Disruption budgets keep at least one replica of each service running during planned maintenance. Pods are rescheduled 30 seconds after their node stops responding instead of the default five minutes. A delay before shutdown lets the network stop routing to a pod before it exits.');
H2('4.10 Network Policies');
P('By default every pod in a Kubernetes cluster can reach every other pod. The namespace starts from a policy that denies all traffic in both directions, and four paths are then opened: visitors to the frontend, the frontend to the backend, the backend to the database, and Prometheus to the backend. Name resolution is also permitted. No pod may open a connection to the internet.');
FIG(diagram('network-policies.png'), 'Permitted and blocked network paths', 600, 200);

// ---- chapter 5 ---------------------------------------------------------------

H1('Testing and Results');
H2('5.1 Test Strategy');
P('Testing was carried out at five levels: unit and integration tests of the application; static checks of images, manifests, and infrastructure code; end-to-end tests of the deployed system; load tests; and failure drills in which components were deliberately removed. Each test is a script in the repository and can be repeated.');
H2('5.2 Test Environments');
T('Test environments', ['Environment', 'Description'], [
  ['Local', 'A three-node Kubernetes cluster created with kind on a laptop, with ArgoCD and the monitoring stack'],
  ['AWS', 'Amazon EKS in the eu-north-1 region, Kubernetes 1.36, two m7i-flex.large nodes in two Availability Zones, reached through the public load balancer from a laptop in Egypt'],
], [2, 7.5]);
H2('5.3 Infrastructure and Delivery');
T('Infrastructure and delivery measurements', ['Measurement', 'Result'], [
  ['Infrastructure created from code (49 resources)', 'About 12 minutes'],
  ['Empty account to application answering on its public address', 'About 17 minutes'],
  ['Terraform plan after apply', 'No changes'],
  ['Resources remaining after destroy', 'None billable, verified for ten resource types'],
  ['Pipeline duration on pull requests', 'Median 103 seconds over 17 runs'],
  ['ArgoCD: root application to seven applications healthy (AWS)', '155 seconds'],
  ['Manual change to the cluster reverted', '1.5 seconds'],
  ['Deleted Service recreated', '4 seconds'],
  ['Commit applied to the cluster after push', '19 seconds'],
  ['Rollback by reverting a commit', '18 seconds'],
  ['Failed requests during a rollout of every pod (AWS)', '0 of 305'],
], [6, 3.5]);
FIG(shot('aws-app-with-tasks.png'), 'The application served from the public load balancer on AWS', 440, 520);
H2('5.4 Load Test');
P('The load test simulates users who list tasks, create one, read it back, mark it complete, and delete it. The number of simulated users rises to 50 over two minutes and is held for three. A script records the replica count and CPU utilisation every five seconds and continues until the backend has returned to its minimum.');
T('Load test results', ['Measure', 'AWS', 'Local', 'Target'], [
  ['Requests sent', '63,108', '81,936', ''],
  ['Failed requests', '0', '0', 'Under 1%'],
  ['Response time, 95th percentile', '171 ms', '301 ms', 'Under 500 ms'],
  ['Response time, median', '98 ms', '8 ms', ''],
  ['Lost writes', '0', '0', '0'],
  ['Time to six replicas', '109 s', '88 s', 'Under 180 s'],
  ['Time to ten replicas', '164 s', '120 s', ''],
  ['Return to two replicas after load', '266 s', '276 s', 'Under 600 s'],
], [3.5, 2, 2, 2]);
P('The AWS figures include the network path from Egypt to Stockholm, which raises the median. All targets were met in both environments.');
FIG(shot('aws-grafana-autoscaling.png'), 'Backend replicas rising from 2 to 10 under load and returning to 2 (AWS)');
FIG(shot('aws-grafana-requests-by-pod.png'), 'Requests shared across backend pods as new pods become ready (AWS)');
H2('5.5 Failure Drills');
T('Failure drill results', ['Drill', 'Failed requests', 'Recovery'], [
  ['One backend pod deleted under load (AWS)', '0 of 225', 'Seconds'],
  ['Every pod replaced by a rollout (AWS)', '0 of 305', 'Not applicable'],
  ['Virtual machine terminated under load (AWS)', '3 of 528 (0.57%)', 'Full capacity in 30 s; replacement node in about 3 minutes'],
  ['Node stopped, replicas spread (local)', '15 of 424 (3.5%)', 'Full capacity in 84 s'],
  ['Node stopped, both backend replicas on it (local, before the fix)', '53 of 336 (15.8%)', 'Full capacity in 88 s'],
  ['Backend scaled to zero', 'Alert fired after 102 s', 'Alert cleared 57 s after recovery'],
], [4.5, 2.5, 3]);
P('On AWS the loss of a node cost 0.57% of requests, within the 1% target. On the local cluster it cost 3.5%. The difference is the load balancer: on AWS it runs its own health checks and stops routing to dead targets within seconds, whereas the local cluster must wait about 40 seconds for Kubernetes to declare the node dead.');
FIG(shot('aws-console-eks-nodes.png'), 'EKS nodes after the node failure drill: the younger node is the automatic replacement');
H2('5.6 Security Verification');
P('The network policies were verified with a script that opens connections from inside the pods and from another namespace. All 11 checks gave the intended result on both clusters, which enforce policies with different network plugins. Before the policies were applied, the same test showed that the frontend could reach the database.');
T('Security verification', ['Check', 'Result'], [
  ['Secrets in Git history', 'None found by Gitleaks'],
  ['Forced commit of a credential file, a fake access key, a private key header', 'Each rejected by the pre-commit hook'],
  ['Direct push to the main branch', 'Rejected by the server'],
  ['Image scan after fixes', 'No fixable high or critical vulnerabilities'],
  ['Frontend to database', 'Blocked'],
  ['Any pod to the internet', 'Blocked'],
  ['Another namespace to backend or database', 'Blocked'],
  ['Containers running as root', 'None. User IDs 10001, 101, and 70 observed'],
  ['Login to Grafana with the chart default password', 'Refused'],
  ['Metrics through the public entry point', 'Not reachable'],
], [6, 3.5]);
H2('5.7 Defects Found by Testing');
P('Three defects were found that no health check revealed: in each case every pod reported itself running and ready.');
T('Defects found and corrected', ['Defect', 'Symptom', 'Correction', 'After'], [
  ['The frontend proxy resolved the backend address once, at start-up', 'After a Service was recreated with a new address, every API request timed out', 'The address is resolved per request and cached for ten seconds', 'Service restored 2 s after recreation'],
  ['Pods shut down while traffic was still routed to them', '4 of 192 requests failed during a rollout', 'A delay before shutdown', '0 of 245 and 0 of 250'],
  ['After a scale-down, both backend replicas were on one node', 'Stopping that node removed the backend for 85 s', 'A descheduler restores the spread', '15.8% failed reduced to 3.5% locally, 0.57% on AWS'],
], [2.6, 2.6, 2.4, 2]);
P('The scanners also found problems before the pipeline was enabled: 41 fixable high and critical vulnerabilities in the frontend image, 4 in the backend image, a database pod with a writable root filesystem, and four dependency advisories. All were corrected.');
H2('5.8 Results Against the Acceptance Criteria');
T('Acceptance criteria summary', ['Result', 'Count', 'Criteria'], [
  ['Met', '21', 'A2, A3, B1, B2, B3, B4, C4, C5, C6, D1, D2, D4, D5, E1, E2, F1, F2, F3, F4, G2, G3'],
  ['Partly met', '4', 'A1, C1, C3, G1'],
  ['Not met', '1', 'F5'],
  ['Not measured', '3', 'C2, D3, E3'],
], [2, 1.2, 6.3]);
T('Criteria not fully met', ['ID', 'Criterion', 'Outcome', 'Cause'], [
  ['A1', 'Environment built by one workflow', 'Built by commands in 17 minutes with no console use', 'Account forbids OIDC providers'],
  ['C1', 'Merge-to-production lead time', '19 s for configuration; an image needs a manual push', 'Same'],
  ['C3', 'Zero manual steps per deployment', 'One step for a new image', 'Same'],
  ['G1', 'Four dashboards', 'One dashboard with 14 panels covering the four views', 'Design choice'],
  ['F5', 'HTTPS with redirect', 'HTTP only', 'No domain name'],
  ['C2', 'Comparison with manual deployment', 'Not measured', 'Not carried out'],
  ['D3', 'Node auto-scaling', 'Not measured', 'Quota of two nodes'],
  ['E3', 'Two-hour availability soak', 'Not measured', 'Not carried out'],
], [0.8, 3, 3.6, 2.4]);
H2('5.9 Cost');
P('The environment costs about 0.40 US dollars per hour while it exists. Because it was created for each session and destroyed afterwards, the first session of about one and a half hours cost 0.56 dollars. Left running continuously it would cost about 290 dollars per month. The registry and state storage that remain between sessions cost about 0.10 dollars per month.');

// ---- chapter 6 ---------------------------------------------------------------

H1('Conclusion and Future Work');
H2('6.1 Conclusion');
P('The project set out to remove the weaknesses of manual deployment by construction, and the measurements show that it did. The environment is created from code in minutes and leaves nothing behind when destroyed. A change cannot reach the main branch without passing tests and security scans. Deployment requires no command: merging to Git is sufficient, and the cluster reverts any change made outside Git within seconds. Capacity follows load, with the backend growing fivefold under test without a single failed request. The loss of a pod or of a whole virtual machine is absorbed with less than 1% of requests affected on AWS. Security controls exist at every layer and each was verified by a test rather than assumed.');
P('The most instructive result is that testing by failure found defects that monitoring did not. In all three cases every component reported itself healthy while the service was degraded or down. This confirms that a platform should be judged by what its users experience under deliberate failure, not by the status its components report.');
H2('6.2 Limitations');
B([
  '**No HTTPS.** There is no domain name, and a certificate requires one. Traffic to the load balancer is unencrypted.',
  '**Image publication is not automated.** The cloud account forbids the identity provider that a pipeline needs to obtain credentials without stored keys. The Terraform module for this exists and is tested but could not be applied.',
  '**The database is a single pod** with no replica and no backup. Its node is a single point of failure.',
  '**Two nodes at most**, because of the account quota. Node auto-scaling was not demonstrated.',
  '**No application authentication.** The API is open to anyone who can reach it.',
  '**Alerts are not delivered** to a person or a channel.',
  '**CPU is an indirect scaling signal** for a service that mostly waits on a database.',
]);
H2('6.3 Future Work');
B([
  'Register a domain, issue a certificate, and serve the application over HTTPS with a redirect.',
  'Move to a standard cloud account and enable the pipeline role, completing the automated path from commit to production.',
  'Replace the in-cluster database with a managed service in two Availability Zones.',
  'Add a node autoscaler and demonstrate scaling of the cluster itself.',
  'Scale on request rate rather than CPU and compare the two.',
  'Store secrets in a secrets manager and synchronise them into the cluster.',
  'Deliver alerts by email or chat, and add an external uptime probe.',
  'Add centralised log collection.',
]);

// ---- references --------------------------------------------------------------

H1('References', false);
N([
  'Kubernetes Documentation. The Kubernetes Authors. https://kubernetes.io/docs/',
  'Terraform Documentation. HashiCorp. https://developer.hashicorp.com/terraform/docs',
  'Amazon EKS User Guide. Amazon Web Services. https://docs.aws.amazon.com/eks/',
  'Argo CD Documentation. The Argo Project. https://argo-cd.readthedocs.io/',
  'Prometheus Documentation. The Prometheus Authors. https://prometheus.io/docs/',
  'Grafana Documentation. Grafana Labs. https://grafana.com/docs/',
  'GitHub Actions Documentation. GitHub. https://docs.github.com/actions',
  'Docker Documentation. Docker Inc. https://docs.docker.com/',
  'FastAPI Documentation. https://fastapi.tiangolo.com/',
  'Kustomize Documentation. https://kubectl.docs.kubernetes.io/',
  'Grafana k6 Documentation. Grafana Labs. https://grafana.com/docs/k6/',
  'Trivy Documentation. Aqua Security. https://trivy.dev/',
  'OpenGitOps Principles. CNCF GitOps Working Group. https://opengitops.dev/',
  'Pod Security Standards. The Kubernetes Authors. https://kubernetes.io/docs/concepts/security/pod-security-standards/',
  'Conventional Commits Specification. https://www.conventionalcommits.org/',
]);
P('[The team should add any textbooks, papers, or course material required by the department\'s referencing style.]', { align: AlignmentType.LEFT });

// ---- appendices --------------------------------------------------------------

H1('Appendix A: Repository Structure', false);
P('The complete source is available at https://github.com/Ahmed-Sabry11/taskboard-platform', { align: AlignmentType.LEFT });
CODE([
  'taskboard-platform/',
  '  app/',
  '    backend/          FastAPI service, migrations, tests, Dockerfile',
  '    frontend/         React application, NGINX configuration, Dockerfile',
  '  infra/',
  '    modules/          network, iam, eks, ecr, pod-identity, security, github-oidc',
  '    stacks/           state-backend, persistent, platform',
  '  deploy/',
  '    apps/taskboard/   base, components, overlays (local, aws)',
  '    argocd/           install, root applications, application definitions',
  '    monitoring/       chart values, scrape definitions, alerts, dashboard',
  '    platform/         storage class',
  '  .github/workflows/  continuous integration pipeline',
  '  .githooks/          secret blocking and commit message format',
  '  scripts/            smoke, scaling, rollout, and network policy tests',
  '  loadtest/           k6 scenario',
  '  docs/               architecture, guides, evaluation results, screenshots',
]);

H1('Appendix B: Reproducing the Results', false);
H3('Local environment');
CODE([
  'kind create cluster --config deploy/local/kind-cluster.yaml',
  'docker compose build',
  'kind load docker-image taskboard-backend:local taskboard-frontend:local --name taskboard',
  'kubectl apply -k deploy/argocd/install --server-side',
  'kubectl apply -f deploy/argocd/root/local.yaml',
]);
P('The two Secrets must be created before the last command, as described in the repository guide `docs/gitops-local.md`.', { align: AlignmentType.LEFT });
H3('AWS environment');
CODE([
  'aws login',
  'terraform -chdir=infra/stacks/platform apply',
  'aws eks update-kubeconfig --region eu-north-1 --name taskboard-dev --alias eks-taskboard',
  'kubectl --context eks-taskboard apply -k deploy/argocd/install --server-side',
  'kubectl --context eks-taskboard apply -f deploy/argocd/root/aws.yaml',
]);
H3('Tests');
CODE([
  '.\\scripts\\smoke-test.ps1',
  '.\\scripts\\scaling-test.ps1 -Scenario ramp',
  '.\\scripts\\rollout-availability-test.ps1',
  '.\\scripts\\network-policy-test.ps1',
]);

H1('Appendix C: Additional Screenshots', false);
chapter = 'C'; figureNo = 0;
FIG(shot('aws-argocd-taskboard-tree-workloads.png'), 'ArgoCD resource tree: deployments, pods, and the database with its volume');
FIG(shot('aws-argocd-taskboard-tree-network-policies.png'), 'ArgoCD resource tree: Ingress and network policies');
FIG(shot('aws-grafana-response-time.png'), 'Response time percentiles during the load test');
FIG(shot('aws-grafana-overview.png'), 'Dashboard summary: request rate, error rate, response time, ready pods', 440, 520);
FIG(shot('aws-console-load-balancer.png'), 'The Application Load Balancer: internet-facing and active in two zones');
FIG(shot('aws-console-ecr-backend.png'), 'Backend images in the registry, tagged with the Git commit');

// ---- document ----------------------------------------------------------------

const doc = new Document({
  creator: 'TaskBoard Platform project team',
  title: 'Design and Implementation of a Secure, Auto-Scaling Multi-Service Infrastructure Using GitOps and Kubernetes',
  features: { updateFields: true },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '[%1]', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 540 } } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: BODY_FONT, size: 24 } } },
  },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'Secure, Auto-Scaling Multi-Service Infrastructure Using GitOps and Kubernetes', font: HEAD_FONT, size: 16, color: '666666' })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: BODY_FONT, size: 20 })],
      })] }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  const out = path.join(__dirname, 'TaskBoard-Project-Book.docx');
  fs.writeFileSync(out, buffer);
  console.log(`wrote ${out} (${Math.round(buffer.length / 1024)} KB, ${children.length} blocks)`);
});
