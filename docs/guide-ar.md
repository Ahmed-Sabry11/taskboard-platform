<div dir="rtl">

# شرح المشروع بالكامل

**Design and Implementation of a Secure, Auto-Scaling Multi-Service Infrastructure Using GitOps and Kubernetes**

الملف ده مكتوب عشان أي حد في الفريق يفهم المشروع من أوله لآخره، ويعرف كل جزء موجود فين في الملفات ويتفتح إزاي. اقراه بالترتيب مرة واحدة، وبعدين ارجعله كمرجع.

كل المصطلحات التقنية مكتوبة بالإنجليزي زي ما هتتقال في المناقشة.

الـ repo على GitHub: https://github.com/Ahmed-Sabry11/taskboard-platform

---

## 1. المشروع في كلمتين

إحنا **ما بنيناش تطبيق**، إحنا بنينا **المنصة** اللي بتشغّل أي تطبيق بشكل احترافي: بتبنيه، تفحصه، تنشره، تكبّره لما الضغط يزيد، تراقبه، وترجّعه لو وقع. وكل ده أوتوماتيك ومن غير ما حد يدخل على السيرفر بإيده.

التطبيق اللي شغال فوق المنصة اسمه **TaskBoard**، وهو تطبيق مهام بسيط (تضيف مهمة، تعدّلها، تمسحها). هو مجرد "حمولة" بنجرّب عليها المنصة. لو حد في اللجنة سأل "التطبيق بسيط ليه؟"، الإجابة: لأن المشروع عن الـ infrastructure مش عن التطبيق، والتطبيق البسيط بيخلّي التركيز على المنصة.

### المشكلة اللي بنحلها

في الطريقة التقليدية، المطوّر بيخلّص الكود وبعدين حد بيدخل على السيرفر يرفعه بإيده. ده معناه:

- النشر بطيء وبيعتمد على شخص معيّن.
- الأخطاء البشرية واردة، ومحدش عارف مين غيّر إيه.
- لو الضغط زاد فجأة السيرفر بيقع.
- لو حاجة وقعت محدش بيعرف غير لما المستخدم يشتكي.

### الحل اللي عملناه

| المشكلة | الحل | الأداة |
|---|---|---|
| بناء السيرفرات بالإيد | الـ infrastructure كلها مكتوبة كود | Terraform |
| "شغال عندي ومش شغال عندك" | التطبيق متعبّي في container | Docker |
| النشر اليدوي | أي تغيير في Git بيتنشر لوحده | ArgoCD (GitOps) |
| الكود المعيوب بيوصل للإنتاج | فحص واختبار أوتوماتيك قبل الدمج | GitHub Actions (CI) |
| الضغط المفاجئ | عدد النسخ بيزيد وينقص لوحده | Kubernetes HPA |
| الأعطال | النظام بيصلّح نفسه | Kubernetes |
| محدش عارف إيه اللي بيحصل | رسومات وتنبيهات | Prometheus و Grafana |

---

## 2. الصورة الكبيرة

دي رحلة أي تغيير من أول ما يتكتب لحد ما يوصل للمستخدم:

```
 المطوّر بيكتب كود
        │  git push على فرع جديد + Pull Request
        ▼
 ┌─ GitHub ──────────────────────────────────────────────┐
 │  CI (GitHub Actions) بيشتغل لوحده:                    │
 │   اختبارات، فحص ثغرات، فحص أسرار، فحص ملفات           │
 │   لو أي حاجة فشلت: الدمج ممنوع                         │
 └───────────────────────┬───────────────────────────────┘
                         │  merge على main
                         ▼
 ┌─ الكلاستر (Kubernetes) ───────────────────────────────┐
 │  ArgoCD قاعد جوه الكلاستر وبيبص على Git كل شوية        │
 │  لقى تغيير؟ بيطبّقه لوحده بالترتيب الصح                 │
 │                                                       │
 │  المستخدم ──► Load Balancer ──► frontend ──► backend  │
 │                                                ▼      │
 │                                           database    │
 │                                                       │
 │  HPA بيزوّد النسخ لما الضغط يعلى                       │
 │  Prometheus بيجمع الأرقام و Grafana بيرسمها            │
 └───────────────────────────────────────────────────────┘
        ▲
        │  الكلاستر نفسه والشبكة اتبنوا بـ Terraform
```

**أهم فكرة في المشروع (GitOps):** Git هو المصدر الوحيد للحقيقة. اللي مكتوب في فرع `main` هو اللي شغال فعلاً. محدش بينفّذ أوامر على الكلاستر بإيده. عايز تغيّر حاجة؟ غيّرها في Git.

---

## 3. قاموس المصطلحات

اقرا الجدول ده كويس، لأن باقي الملف مبني عليه.

| المصطلح | معناه ببساطة |
|---|---|
| **Container** | علبة فيها التطبيق وكل اللي محتاجه عشان يشتغل. بتشتغل بنفس الشكل على أي جهاز. |
| **Image** | القالب اللي بنعمل منه الـ container. زي ملف التسطيب. |
| **Dockerfile** | الملف اللي بيوصف إزاي نبني الـ image خطوة خطوة. |
| **Docker Compose** | أداة بتشغّل كذا container مع بعض على جهازك بأمر واحد. |
| **Kubernetes (K8s)** | نظام بيدير الـ containers على مجموعة سيرفرات: يشغّلها، يوزّعها، يرجّعها لو وقعت. |
| **Cluster** | مجموعة السيرفرات اللي Kubernetes بيديرها. |
| **Node** | سيرفر واحد جوه الكلاستر. |
| **Pod** | أصغر وحدة في Kubernetes: container واحد أو أكتر شغالين مع بعض. |
| **Deployment** | بيقول لـ Kubernetes: "عايز كذا نسخة من الـ pod ده شغالين دايماً". |
| **Service** | عنوان ثابت جوه الكلاستر بيوصّل لمجموعة pods ويوزّع عليهم. |
| **Ingress** | الباب اللي الترافيك بيدخل منه من بره الكلاستر. |
| **Namespace** | تقسيمة جوه الكلاستر، زي فولدر. بتاعتنا اسمها `taskboard`. |
| **Manifest** | ملف YAML بيوصف حاجة في Kubernetes. |
| **Kustomize** | أداة بتخلّينا نكتب الملفات مرة (base) ونعدّل عليها لكل بيئة (overlay). |
| **IaC (Infrastructure as Code)** | إننا نكتب السيرفرات والشبكات كود بدل ما نعملها بالماوس. |
| **Terraform** | أداة الـ IaC. بتقرا الكود وتنشئ الموارد على AWS. |
| **State** | ملف Terraform بيسجّل فيه هو أنشأ إيه. |
| **CI (Continuous Integration)** | فحص واختبار الكود أوتوماتيك مع كل تغيير. |
| **CD (Continuous Delivery)** | نشر الكود أوتوماتيك بعد ما يعدّي الفحص. |
| **GitOps** | طريقة للـ CD: الكلاستر بيسحب حالته من Git ويفضل مطابق ليه. |
| **ArgoCD** | الأداة اللي بتنفّذ الـ GitOps. |
| **Drift** | لما اللي شغال فعلاً يبقى مختلف عن اللي في Git. |
| **HPA** | Horizontal Pod Autoscaler: بيزوّد وينقّص عدد الـ pods حسب الضغط. |
| **Prometheus** | بيجمع الأرقام (metrics) من كل حاجة ويخزّنها. |
| **Grafana** | بيرسم الأرقام دي في dashboards. |
| **VPC** | الشبكة الخاصة بتاعتنا على AWS. |
| **Subnet** | جزء من الـ VPC. العامة (public) بتوصل للإنترنت، والخاصة (private) لأ. |
| **EKS** | خدمة Kubernetes من AWS. |
| **ECR** | مخزن الـ images على AWS. |
| **IAM** | نظام الصلاحيات على AWS. |
| **Load Balancer (ALB)** | بيستقبل الترافيك من الإنترنت ويوزّعه على الـ pods. |
| **NAT Gateway** | بيخلّي السيرفرات الخاصة تطلع للإنترنت من غير ما حد يدخل عليها. |

---

## 4. هيكل الـ repo

الـ repo مقسوم حسب **مين اللي بيطبّق التغيير**:

| الفولدر | فيه إيه | مين بيطبّقه |
|---|---|---|
| `app/` | كود التطبيق | الـ CI بيبنيه image |
| `infra/` | كود Terraform لكل حاجة على AWS | Terraform |
| `deploy/` | ملفات Kubernetes لكل حاجة جوه الكلاستر | ArgoCD |
| `.github/workflows/` | الـ CI | GitHub Actions |
| `scripts/` | سكريبتات الاختبار والقياس | إحنا |
| `loadtest/` | اختبار الحمل | k6 |
| `docs/` | كل التوثيق والنتايج والصور | |

الشجرة بالتفصيل:

```
taskboard-platform/
├── app/
│   ├── backend/              الـ API (FastAPI)
│   │   ├── app/              الكود: main, config, models, schemas, routers, metrics
│   │   ├── migrations/       تعديلات قاعدة البيانات (Alembic)
│   │   ├── tests/            unit و integration
│   │   └── Dockerfile
│   └── frontend/             الواجهة (React)
│       ├── src/              الكود والاختبارات
│       ├── nginx/            إعدادات الـ web server
│       └── Dockerfile
├── infra/
│   ├── modules/              قطع قابلة لإعادة الاستخدام
│   │   ├── network/          الـ VPC والـ subnets
│   │   ├── iam/              صلاحيات الكلاستر
│   │   ├── eks/              الكلاستر والـ nodes
│   │   ├── ecr/              مخزن الـ images
│   │   ├── pod-identity/     صلاحية لكل controller
│   │   ├── github-oidc/      ربط GitHub بـ AWS من غير مفاتيح
│   │   └── security/         الـ security groups
│   └── stacks/               اللي بيتنفّذ فعلاً
│       ├── state-backend/    مخزن الـ state
│       ├── persistent/       الـ ECR
│       └── platform/         الشبكة والكلاستر
├── deploy/
│   ├── apps/taskboard/
│   │   ├── base/             ملفات مشتركة بين كل البيئات
│   │   ├── components/       قاعدة البيانات
│   │   └── overlays/         local و aws
│   ├── argocd/               تعريفات ArgoCD
│   ├── monitoring/           المراقبة والـ dashboard
│   ├── platform/             إعدادات التخزين
│   └── local/                تعريف الكلاستر المحلي
├── .github/workflows/ci.yml  الـ CI
├── .githooks/                حماية الأسرار وصيغة الـ commits
├── scripts/                  سكريبتات الاختبار والقياس
├── loadtest/taskboard.js     اختبار الحمل
├── docs/                     التوثيق
└── docker-compose.yml        تشغيل محلي
```

---

## 5. التطبيق نفسه

3 خدمات:

| الخدمة | التقنية | وظيفتها | المنفذ |
|---|---|---|---|
| **frontend** | React + NGINX | الصفحة اللي المستخدم بيشوفها | 8080 |
| **backend** | FastAPI (Python) | الـ API: بيستقبل الطلبات ويكلم قاعدة البيانات | 8000 |
| **database** | PostgreSQL | بتخزّن المهام | 5432 |

### الـ backend

| الملف | وظيفته |
|---|---|
| `app/backend/app/main.py` | نقطة البداية: بينشئ التطبيق ويربط الأجزاء |
| `app/backend/app/config.py` | بيقرا الإعدادات من environment variables |
| `app/backend/app/models.py` | شكل جدول `tasks` في قاعدة البيانات |
| `app/backend/app/schemas.py` | التحقق من البيانات الداخلة (validation) |
| `app/backend/app/routers/tasks.py` | عمليات المهام: إضافة، قراءة، تعديل، مسح |
| `app/backend/app/routers/health.py` | نقطتين للفحص: `healthz` و `readyz` |
| `app/backend/app/metrics.py` | بيطلّع الأرقام لـ Prometheus |
| `app/backend/migrations/` | إنشاء وتعديل الجداول |

**نقطتين مهمين للمناقشة:**

- **`/api/healthz`** معناها "البرنامج شغال". لو فشلت، Kubernetes بيعيد تشغيل الـ container.
- **`/api/readyz`** معناها "أنا جاهز أستقبل طلبات" (يعني قاعدة البيانات واصلة). لو فشلت، Kubernetes بيوقّف الترافيك عن الـ pod ده من غير ما يعيد تشغيله.

الفرق ده مقصود: لو قاعدة البيانات وقعت، مش عايزين كل الـ pods السليمة تتعاد تشغيلها من غير فايدة.

**الـ API:**

| العملية | المسار |
|---|---|
| كل المهام | `GET /api/tasks` |
| إضافة مهمة | `POST /api/tasks` |
| مهمة واحدة | `GET /api/tasks/{id}` |
| تعديل | `PATCH /api/tasks/{id}` |
| مسح | `DELETE /api/tasks/{id}` |

### الـ frontend

| الملف | وظيفته |
|---|---|
| `app/frontend/src/App.tsx` | الصفحة الرئيسية |
| `app/frontend/src/api.ts` | بيكلم الـ backend |
| `app/frontend/src/components/` | الفورم وعنصر المهمة |
| `app/frontend/nginx/default.conf.template` | إعدادات NGINX: بيعرض الصفحة ويحوّل `/api` للـ backend |

### الاختبارات

| النوع | المكان | العدد |
|---|---|---|
| backend unit | `app/backend/tests/unit/` | 86 اختبار للـ backend إجمالاً |
| backend integration (على PostgreSQL حقيقي) | `app/backend/tests/integration/` | |
| frontend | `app/frontend/src/*.test.ts(x)` | 29 |

### تشغّله إزاي على جهازك

محتاج Docker Desktop شغال. من فولدر المشروع:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

وبعدين افتح:

| اللينك | فيه إيه |
|---|---|
| http://127.0.0.1:8080 | التطبيق |
| http://127.0.0.1:8000/api/docs | توثيق الـ API التفاعلي |
| http://127.0.0.1:8000/metrics | الأرقام اللي Prometheus بيقراها |

تشغيل الاختبارات:

```powershell
.\scripts\smoke-test.ps1
docker compose --profile test run --rm --build backend-tests
docker compose --profile test run --rm --build frontend-tests
```

الإيقاف: `docker compose down`

التفاصيل الكاملة: [docs/local-development.md](local-development.md)

---

## 6. Docker

### الـ Dockerfiles

الملفين: `app/backend/Dockerfile` و `app/frontend/Dockerfile`

الاتنين **multi-stage**: مرحلة بتبني، ومرحلة نهائية بتاخد الناتج بس. الفايدة إن الـ image النهائية صغيرة ومفيهاش أدوات بناء ممكن تُستغل.

| | backend | frontend |
|---|---|---|
| الـ image النهائية فيها | Python والكود بس | NGINX وملفات ثابتة بس، من غير Node.js |
| المستخدم | UID 10001 (مش root) | UID 101 (مش root) |
| الحجم | حوالي 77MB | حوالي 26MB |

**ليه non-root؟** لو حد اخترق التطبيق، مش هياخد صلاحيات كاملة على الـ container.

### Docker Compose

الملف: `docker-compose.yml`

بيشغّل 4 حاجات بالترتيب: قاعدة البيانات، ثم `migrate` (بينشئ الجداول ويخلص)، ثم الـ backend، ثم الـ frontend.

**الشبكات:** فيه شبكتين منفصلتين:

```
 frontend ──(edge)── backend ──(data)── db
```

الـ frontend مش على شبكة `data`، فمالوش أي طريق لقاعدة البيانات. دي نفس الفكرة اللي طبّقناها في Kubernetes بالـ NetworkPolicies.

**التخزين:** بيانات قاعدة البيانات في volume اسمه `db-data`، فبتفضل موجودة حتى لو الـ containers اتمسحت.

---

## 7. Git وطريقة الشغل

الملف المرجعي: [CONTRIBUTING.md](../CONTRIBUTING.md)

### الفروع

- فرع **`main`** محمي: محدش يقدر يعمل push عليه مباشرة، حتى صاحب الـ repo.
- أي تغيير بيتعمل على فرع جديد، وبعدين **Pull Request**، ولازم الـ CI يعدّي قبل الدمج.

تشوف كل الـ PRs اللي اتعملت: https://github.com/Ahmed-Sabry11/taskboard-platform/pulls?q=is%3Apr

### صيغة الـ commits

`<type>(<scope>): <summary>`، مثال: `feat(backend): add due-date filter`

الأنواع: `feat` (ميزة)، `fix` (إصلاح)، `docs` (توثيق)، `ci`، `build`، `test`.

### حماية الأسرار (3 طبقات)

| الطبقة | بتعمل إيه | الملف |
|---|---|---|
| `.gitignore` | بتمنع ملفات الباسوردات والـ state من الدخول لـ Git | `.gitignore` |
| pre-commit hook | بيرفض أي commit فيه حاجة شكلها سر | `.githooks/pre-commit` |
| GitHub + CI | بيفحصوا كل push وكل PR | Gitleaks في الـ CI |

كل واحد يعمل clone لازم يشغّل الأمر ده مرة واحدة عشان يفعّل الـ hooks:

```powershell
git config core.hooksPath .githooks
```

---

## 8. الـ CI

الملف: `.github/workflows/ci.yml`

تشوفه شغال: https://github.com/Ahmed-Sabry11/taskboard-platform/actions

بيشتغل لوحده مع كل Pull Request. فيه 6 مهام، وكل واحدة بتشتغل بس لو الملفات بتاعتها اتغيرت:

| المهمة | بتفحص إيه |
|---|---|
| Secret scan | إن مفيش أسرار في أي commit (Gitleaks) |
| Backend | الـ lint والاختبارات على PostgreSQL حقيقي |
| Frontend | الـ TypeScript والاختبارات |
| Build, scan, smoke | بناء الـ images، فحص الثغرات (Trivy)، تشغيل التطبيق كامل وتجربته |
| Config | فحص الـ Dockerfiles وملفات Kubernetes و Terraform |
| Terraform | الصيغة والصحة واختبارات الـ plan |

وفي الآخر مهمة اسمها **`ci-ok`** بتتأكد إن كله نجح. دي الوحيدة المطلوبة عشان الدمج يتفتح.

**أرقام:** متوسط زمن الـ CI حوالي 103 ثانية.

**قصة حقيقية للمناقشة:** أول ما شغّلنا فحص الثغرات لقى 41 ثغرة في image الـ frontend و4 في الـ backend. صلّحناهم (حدّثنا الـ base image وشيلنا pip من الـ image النهائية)، ومن ساعتها أي image فيها ثغرة خطيرة الـ CI بيرفضها.

الشرح الكامل: [.github/workflows/README.md](../.github/workflows/README.md)

---

## 9. Kubernetes على الجهاز

بنستخدم **kind**، وده بيعمل كلاستر Kubernetes جوه Docker. الكلاستر بتاعنا 3 nodes.

### الملفات

| الملف | وظيفته |
|---|---|
| `deploy/local/kind-cluster.yaml` | تعريف الكلاستر المحلي |
| `deploy/apps/taskboard/base/` | الملفات المشتركة |
| `deploy/apps/taskboard/overlays/local/` | تعديلات البيئة المحلية |
| `deploy/apps/taskboard/overlays/aws/` | تعديلات AWS |
| `deploy/apps/taskboard/components/postgres/` | قاعدة البيانات |

### اللي جوه الـ base

| الملف | بيعرّف إيه |
|---|---|
| `namespace.yaml` | الـ namespace ومستوى الأمان بتاعه |
| `backend-deployment.yaml` | الـ backend: الـ image، الموارد، الـ probes، الأمان |
| `frontend-deployment.yaml` | الـ frontend بنفس الشكل |
| `backend-service.yaml` و `frontend-service.yaml` | العناوين الثابتة |
| `migrate-job.yaml` | مهمة بتشتغل مرة قبل كل نشر تحدّث الجداول |
| `autoscaling.yaml` | الـ HPA |
| `disruption-budgets.yaml` | ضمان إن نسخة واحدة على الأقل تفضل شغالة |
| `network-policies.yaml` | مين يكلم مين |
| `kustomization.yaml` | بيجمع كل ده، وفيه الإعدادات (ConfigMap) |

**فكرة base و overlay:** 90% من الملفات واحدة في كل البيئات. فبنكتبها مرة في `base`، وكل بيئة بتعدّل اللي يخصها بس:

| | local | aws |
|---|---|---|
| الـ images | مبنية على الجهاز | من ECR |
| الدخول | منفذ على `127.0.0.1:8090` | Load Balancer عام |
| قرص قاعدة البيانات | فولدر جوه الـ node | EBS volume مشفّر |

### تشغّله إزاي

```powershell
kind create cluster --config deploy/local/kind-cluster.yaml
docker compose build
kind load docker-image taskboard-backend:local taskboard-frontend:local --name taskboard
```

وبعدين تتبع خطوات ArgoCD في القسم الجاي. التطبيق بيفتح على: http://127.0.0.1:8090

أوامر مفيدة تشوف بيها اللي شغال:

```powershell
kubectl -n taskboard get pods -o wide
kubectl -n taskboard get hpa
kubectl -n taskboard logs deployment/backend
kubectl -n argocd get applications
```

الشرح الكامل: [docs/kubernetes-local.md](kubernetes-local.md)

---

## 10. GitOps و ArgoCD

دي قلب المشروع.

### الفكرة

ArgoCD برنامج شغال **جوه الكلاستر**. كل شوية بيبص على الـ repo، ولو لقى فرق بين اللي في Git واللي شغال، بيخلّي اللي شغال يطابق Git.

**ليه ده أحسن من إن الـ CI ينشر بنفسه؟** لأن في الطريقة دي (pull) الكلاستر هو اللي بيسحب، فمفيش أي نظام بره الكلاستر معاه مفاتيحه. لو GitHub نفسه اتخترق، المخترق مش هيلاقي مفاتيح الكلاستر.

### الملفات

| الملف | وظيفته |
|---|---|
| `deploy/argocd/install/` | تسطيب ArgoCD نفسه (إصدار 3.5.5) |
| `deploy/argocd/root/local.yaml` و `aws.yaml` | التطبيق "الأب" |
| `deploy/argocd/apps/local/` و `apps/aws/` | التطبيقات اللي الأب بينشئها |

### نمط App of Apps

بنطبّق ملف واحد بس بإيدينا (الـ root)، وهو بينشئ كل التطبيقات التانية من Git:

```
 root
  ├── taskboard              التطبيق
  ├── monitoring             Prometheus و Grafana
  ├── taskboard-monitoring   الـ dashboard والتنبيهات
  ├── descheduler            توزيع الـ pods على الـ nodes
  ├── aws-load-balancer-controller   (على AWS بس)
  └── storage                (على AWS بس)
```

### ترتيب النشر (Sync Waves)

ArgoCD بينشر على موجات، وبيستنى كل موجة تبقى سليمة قبل اللي بعدها:

| الموجة | إيه اللي بيتنشر |
|---|---|
| -3 | الـ namespace |
| -2 | الإعدادات والـ NetworkPolicies |
| -1 | قاعدة البيانات |
| 0 | الـ migration |
| 1 | الـ backend والـ frontend |

لو الـ migration فشل، النشر بيقف والنسخة القديمة بتفضل شغالة.

### تفتح الواجهة إزاي

```powershell
kubectl -n argocd port-forward service/argocd-server 8443:443
```

افتح https://127.0.0.1:8443 (اقبل تحذير الشهادة). المستخدم `admin`، والباسورد:

```powershell
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}')))
```

### تجارب تعملها قدام اللجنة

**1. الـ self-heal:** امسح حاجة بإيدك وشوف ArgoCD يرجّعها:

```powershell
kubectl -n taskboard delete service backend
kubectl -n taskboard get service backend
```

**2. الـ rollback:** `git revert` للـ commit، والكلاستر يرجع للحالة السابقة.

### الأرقام اللي قسناها

| التجربة | النتيجة |
|---|---|
| من كلاستر فاضي لكل حاجة شغالة (AWS) | 155 ثانية |
| تغيير يدوي اترجّع | 1.5 ثانية |
| Service اتمسح واترجّع | 4 ثواني |
| commit اتطبّق على الكلاستر | 19 ثانية |
| rollback بـ git revert | 18 ثانية |

الشرح الكامل: [docs/gitops-local.md](gitops-local.md) و [docs/gitops-aws.md](gitops-aws.md)

---

## 11. Terraform و AWS

### اللي بنبنيه على AWS

```
 ┌─ AWS (region: Stockholm, eu-north-1) ─────────────────────┐
 │  S3: ملف الـ state        ECR: الـ images       KMS: تشفير │
 │                                                           │
 │  ┌─ VPC 10.0.0.0/16 ───────────────────────────────────┐  │
 │  │  Public subnets (2)  : NAT Gateway, Load Balancer   │  │
 │  │  Private subnets (2) : الكلاستر والـ 2 nodes        │  │
 │  └─────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────┘
```

**ليه private subnets؟** الـ nodes مالهاش عناوين عامة، فمحدش من الإنترنت يقدر يوصلها مباشرة. الدخول الوحيد من الـ Load Balancer.

### الـ modules

كل module قطعة مستقلة بتتعاد استخدامها:

| الـ module | بينشئ إيه |
|---|---|
| `infra/modules/network` | الـ VPC، 4 subnets، Internet Gateway، NAT |
| `infra/modules/iam` | صلاحيات الكلاستر والـ nodes |
| `infra/modules/eks` | الكلاستر، الـ nodes، التشفير، الـ logs |
| `infra/modules/ecr` | مخزن الـ images |
| `infra/modules/pod-identity` | صلاحية AWS لـ pod معيّن بس |
| `infra/modules/security` | قواعد الـ Load Balancer |
| `infra/modules/github-oidc` | ربط GitHub بـ AWS (مكتوب ومختبر، بس مقفول بسبب قيود الحساب) |

### الـ stacks

| الـ stack | فيه إيه | عمره |
|---|---|---|
| `state-backend` | الـ S3 bucket بتاع الـ state | دايم |
| `persistent` | الـ ECR | دايم (تكلفته سنتات) |
| `platform` | الشبكة والكلاستر (49 مورد) | بيتنشأ لكل جلسة ويتمسح بعدها |

**ليه مقسّمينهم؟** عشان نقدر نمسح الحاجات الغالية (الكلاستر) بعد كل جلسة، ونسيب الرخيصة (الـ images).

### الـ state

Terraform بيسجّل اللي أنشأه في ملف اسمه state. إحنا مخزّنينه في S3 مش على الجهاز، ومعاه **lock** عشان اتنين ما يعدّلوش في نفس الوقت. الملف ده فيه بيانات حساسة، فممنوع يدخل Git نهائياً.

### الاختبارات

فيه 25 اختبار Terraform بيشتغلوا على provider وهمي، من غير ما يكلموا AWS. تشغّلهم:

```powershell
terraform -chdir=infra/stacks/platform init -backend=false
terraform -chdir=infra/stacks/platform test
```

### الحساب اللي استخدمناه وقيوده

حساب AWS مجاني (Free plan) فيه credits. القيود اللي اكتشفناها بالتجربة:

| القيد | تأثيره |
|---|---|
| region واحدة بس (Stockholm) | كل حاجة في `eu-north-1` |
| أنواع محددة من السيرفرات | استخدمنا `m7i-flex.large` بدل `t3.medium` |
| 5 vCPU كحد أقصى | 2 nodes بس |
| ممنوع OIDC providers | الـ CI مش بيرفع الـ images لوحده، بنرفعها بسكريبت |

### تشغيل البيئة على AWS

لازم تسجيل دخول الأول:

```powershell
aws login
```

وبعدين:

```powershell
terraform -chdir=infra/stacks/platform init "-backend-config=../../backend.hcl"
terraform -chdir=infra/stacks/platform plan -out=tfplan
terraform -chdir=infra/stacks/platform apply tfplan
```

بياخد حوالي 12 دقيقة. بعدها خطوات ArgoCD موجودة في [docs/gitops-aws.md](gitops-aws.md).

**التكلفة:** حوالي 0.40 دولار في الساعة والبيئة شغالة.

### مسح البيئة (مهم جداً)

**الترتيب مهم.** لازم نمسح اللي Kubernetes أنشأه على AWS (الـ Load Balancer والأقراص) **قبل** ما نمسح الكلاستر، وإلا هيفضلوا يتحاسبوا. الخطوات بالظبط في [docs/gitops-aws.md](gitops-aws.md) قسم "Take the environment down".

### تشوف الموارد على AWS Console

والبيئة شغالة (region: Stockholm):

| الحاجة | اللينك |
|---|---|
| الكلاستر | https://eu-north-1.console.aws.amazon.com/eks/home?region=eu-north-1#/clusters/taskboard-dev |
| الـ Load Balancer | https://eu-north-1.console.aws.amazon.com/ec2/home?region=eu-north-1#LoadBalancers: |
| الـ images | https://eu-north-1.console.aws.amazon.com/ecr/private-registry/repositories?region=eu-north-1 |
| الشبكة | https://eu-north-1.console.aws.amazon.com/vpcconsole/home?region=eu-north-1#vpcs: |

الـ ECR بس هو اللي موجود دايماً. الباقي بيظهر لما البيئة تبقى شغالة.

الشرح الكامل: [docs/infrastructure.md](infrastructure.md)

---

## 12. المراقبة

### المكونات

| المكوّن | وظيفته |
|---|---|
| **Prometheus** | بيسأل كل pod عن أرقامه كل 15 ثانية ويخزّنها |
| **Grafana** | بيرسمها |
| **Alertmanager** | بيستقبل التنبيهات |

### الملفات

| الملف | وظيفته |
|---|---|
| `app/backend/app/metrics.py` | الـ backend بيطلّع أرقامه على `/metrics` |
| `deploy/monitoring/stack/values.yaml` | إعدادات Prometheus و Grafana |
| `deploy/monitoring/taskboard/backend-servicemonitor.yaml` | بيقول لـ Prometheus يقرا من الـ backend |
| `deploy/monitoring/taskboard/backend-alerts.yaml` | 8 تنبيهات |
| `deploy/monitoring/taskboard/dashboards/taskboard.json` | الـ dashboard (14 لوحة) |

**ملاحظة أمنية:** `/metrics` بره `/api` عن قصد، فمش بيتكشف للإنترنت. الـ Load Balancer بيحوّل `/api` بس.

### تفتح Grafana إزاي

```powershell
kubectl -n monitoring port-forward service/monitoring-grafana 3000:80
```

افتح http://127.0.0.1:3000/d/taskboard-overview، المستخدم `admin`، والباسورد:

```powershell
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((kubectl -n monitoring get secret grafana-admin -o jsonpath='{.data.admin-password}')))
```

### التنبيهات

| التنبيه | بيشتغل لما |
|---|---|
| TaskboardBackendDown | مفيش ولا backend pod شغال |
| TaskboardHighErrorRate | أكتر من 5% من الطلبات بتفشل |
| TaskboardHighLatency | الاستجابة أبطأ من ثانية |
| TaskboardBackendAtMaxReplicas | الـ backend وصل للحد الأقصى |
| TaskboardNotInSyncWithGit | الكلاستر مش مطابق لـ Git |

**قسناها:** وقّعنا الـ backend عن قصد، والتنبيه اشتغل بعد 102 ثانية.

الشرح الكامل: [docs/observability.md](observability.md)

---

## 13. الـ Auto-scaling والصمود

### الـ HPA

الملف: `deploy/apps/taskboard/base/autoscaling.yaml`

| | backend | frontend |
|---|---|---|
| أقل عدد | 2 | 2 |
| أكتر عدد | 10 | 4 |
| بيزوّد لما | الـ CPU يعدّي 60% | الـ CPU يعدّي 70% |

**ليه أقل عدد 2؟** عشان لو واحد وقع أو بيتحدّث، التاني يفضل شغال.

**التكبير سريع والتصغير بطيء عن قصد:** لو اتأخرنا في التكبير المستخدم بيتأثر، ولو استعجلنا في التصغير ممكن نشيل pods ونرجع نضيفها تاني.

### اختبار الحمل

الملف: `loadtest/taskboard.js` (أداة k6)

بيحاكي مستخدمين حقيقيين: كل واحد بيعرض المهام، يضيف واحدة، يقراها، يخلّصها، ويمسحها.

```powershell
.\scripts\scaling-test.ps1 -Scenario ramp
```

السكريبت بيشغّل الحمل ويسجّل عدد الـ pods كل 5 ثواني.

### النتايج

| القياس | على AWS | محلي | الهدف |
|---|---|---|---|
| عدد الطلبات | 63,108 | 81,936 | |
| طلبات فاشلة | 0 | 0 | أقل من 1% |
| زمن الاستجابة p95 | 171 ms | 301 ms | أقل من 500 ms |
| بيانات ضايعة | 0 | 0 | 0 |
| من 2 لـ 10 pods | 164 ثانية | 120 ثانية | |
| الرجوع لـ 2 | 266 ثانية | 276 ثانية | خلال 10 دقايق |

**p95 معناها:** 95% من الطلبات كانت أسرع من الرقم ده.

### تجارب الأعطال

| التجربة | النتيجة |
|---|---|
| مسح pod تحت ضغط | 0 طلبات فشلت من 225 |
| تحديث كل الـ pods تحت ضغط | 0 فشلت من 305 |
| قفل سيرفر كامل على AWS تحت ضغط | 3 فشلوا من 528 (0.57%)، ورجع في 30 ثانية |

### 3 عيوب اكتشفناها بالاختبار وصلّحناها

دي أقوى حاجة تتقال في المناقشة، لأنها بتثبت إننا اختبرنا فعلاً:

**1. NGINX كان بيحفظ عنوان الـ backend.** لما الـ Service اتمسح واترجّع بعنوان جديد، كل الطلبات وقعت مع إن كل الـ pods كانت "سليمة". الحل: NGINX بقى يسأل عن العنوان مع كل طلب.

**2. طلبات كانت بتضيع وقت التحديث** (4 من 192). السبب إن الـ pod كان بيقفل قبل ما الترافيك يتحوّل عنه. الحل: مهلة قبل القفل (`preStop`). بعدها بقت صفر.

**3. الـ 2 backend pods بقوا على نفس السيرفر.** بعد ما الـ HPA صغّر من 10 لـ 2، الاتنين الباقيين طلعوا على نفس الـ node. لما قفلناها الخدمة وقعت 85 ثانية. Kubernetes بيوزّع وقت التشغيل بس ومش بيعيد التوزيع. الحل: أضفنا **descheduler** بيراجع التوزيع كل دقيقتين.

الشرح الكامل: [docs/autoscaling.md](autoscaling.md)

---

## 14. الأمان

الأمان متطبّق على كل طبقة (Defense in Depth):

| الطبقة | اللي عملناه |
|---|---|
| **الكود** | مفيش أسرار في Git، وفحص أوتوماتيك لكل commit |
| **البناء** | فحص ثغرات لكل image، والمعيوبة بتترفض |
| **الـ containers** | مش root، ومفيهاش أدوات بناء |
| **الـ pods** | نظام ملفات للقراءة بس، من غير أي صلاحيات زيادة |
| **الشبكة جوه الكلاستر** | كله ممنوع إلا المسارات اللي التطبيق محتاجها |
| **شبكة AWS** | الـ nodes في شبكة خاصة، ومدخل واحد |
| **صلاحيات AWS** | أقل صلاحية ممكنة، ومفيش مفاتيح دايمة |
| **البيانات** | الأسرار والأقراص مشفّرة |

### الـ NetworkPolicies

الملف: `deploy/apps/taskboard/base/network-policies.yaml`

الأصل في Kubernetes إن أي pod يكلم أي pod. إحنا قفلنا كل حاجة وفتحنا 4 مسارات بس:

```
 الزوار ──► frontend ──► backend ──► database
                            ▲
                       Prometheus
```

تختبرها:

```powershell
.\scripts\network-policy-test.ps1
```

| الاتصال | النتيجة |
|---|---|
| الـ frontend لقاعدة البيانات | ممنوع |
| أي pod للإنترنت | ممنوع |
| namespace تاني للـ backend | ممنوع |

عدّى 11 من 11 على الكلاستر المحلي وعلى AWS.

الشرح الكامل: [docs/security.md](security.md)

---

## 15. النتايج النهائية

قيّمنا المشروع على 29 معيار كنا محددينهم من الأول:

| النتيجة | العدد |
|---|---|
| اتحقق | 21 |
| اتحقق جزئياً | 4 |
| ما اتحققش | 1 |
| ما اتقاسش | 3 |

الجدول الكامل بالأرقام: [docs/evaluation/results.md](evaluation/results.md)

الصور (14 صورة من AWS): [docs/evaluation/screenshots/](evaluation/screenshots/)

| الصورة | بتثبت إيه |
|---|---|
| `aws-app-with-tasks.png` | التطبيق شغال على AWS |
| `aws-grafana-autoscaling.png` | التمدد من 2 لـ 10 |
| `aws-argocd-applications.png` | الـ 7 تطبيقات شغالين من Git |
| `aws-console-eks-nodes.png` | الـ nodes، ومنهم واحدة بديلة اتعملت لوحدها |
| `aws-console-vpc-resource-map.png` | شكل الشبكة |

---

## 16. القيود (Limitations)

لازم نقولها بنفسنا في المناقشة قبل ما حد يسأل:

| القيد | السبب | الحل لو فيه وقت أو ميزانية |
|---|---|---|
| مفيش HTTPS | مفيش domain name | نشتري domain ونضيف شهادة |
| رفع الـ images بسكريبت مش من الـ CI | الحساب المجاني بيمنع OIDC | حساب AWS عادي (الكود جاهز ومختبر) |
| قاعدة البيانات pod واحد | أبسط وأرخص | Amazon RDS بنسخة احتياطية |
| 2 nodes بس | حد الحساب المجاني | حساب عادي + Cluster Autoscaler |
| التطبيق من غير تسجيل دخول | خارج نطاق المشروع | إضافة authentication |
| التنبيهات مش بتتبعت لحد | ما اتظبطتش | ربط Alertmanager بإيميل أو Slack |

---

## 17. تشغيل كل حاجة من الصفر

### محلياً (مجاناً)

```powershell
# 1. الكلاستر والـ images
kind create cluster --config deploy/local/kind-cluster.yaml
docker compose build
kind load docker-image taskboard-backend:local taskboard-frontend:local --name taskboard

# 2. ArgoCD
kubectl apply -k deploy/argocd/install --server-side
kubectl -n argocd wait --for=condition=Available deployment --all --timeout=420s

# 3. الأسرار (مش في Git)
Copy-Item deploy/apps/taskboard/overlays/local/secrets.env.example deploy/apps/taskboard/overlays/local/secrets.env
kubectl apply -f deploy/apps/taskboard/base/namespace.yaml
kubectl -n taskboard create secret generic taskboard-db-credentials --from-env-file=deploy/apps/taskboard/overlays/local/secrets.env
kubectl create namespace monitoring
$password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
kubectl -n monitoring create secret generic grafana-admin --from-literal=admin-user=admin --from-literal=admin-password=$password

# 4. تسليم الكلاستر لـ Git
kubectl apply -f deploy/argocd/root/local.yaml
kubectl -n argocd get applications -w
```

غيّر الباسورد في `secrets.env` قبل ما تشغّل (حروف وأرقام بس). باسورد Grafana بيتولّد عشوائي، وطريقة قرايته في قسم المراقبة.

بعد حوالي 5 دقايق افتح http://127.0.0.1:8090

المسح: `kind delete cluster --name taskboard`

### على AWS

الخطوات في [docs/gitops-aws.md](gitops-aws.md). **ما تنساش الـ destroy في الآخر.**

---

## 18. السكريبتات

كلها في `scripts/`:

| السكريبت | بيعمل إيه |
|---|---|
| `smoke-test.ps1` | بيجرّب التطبيق من أوله لآخره (16 فحص على Kubernetes، و21 على Docker Compose) |
| `scaling-test.ps1` | اختبار الحمل وتسجيل رد فعل الـ HPA |
| `rollout-availability-test.ps1` | بيعدّ الطلبات اللي ضاعت وقت التحديث |
| `network-policy-test.ps1` | بيتأكد إن قواعد الشبكة شغالة |
| `push-images.ps1` | بيبني ويرفع الـ images على ECR |
| `check-repo-safety.ps1` | بيتأكد إن مفيش أسرار هتترفع |

---

## 19. اقتراح لتقسيم المذاكرة على 4

كل واحد يبقى مسؤول عن جزء ويقدر يجاوب فيه بثقة، وكلكم تقروا الأقسام 1 و2 و3.

| العضو | المسؤولية | الأقسام | الملفات |
|---|---|---|---|
| 1 | التطبيق و Docker والـ CI | 5، 6، 7، 8 | `app/`، `docker-compose.yml`، `.github/workflows/ci.yml` |
| 2 | Kubernetes و GitOps | 9، 10 | `deploy/apps/`، `deploy/argocd/` |
| 3 | Terraform و AWS | 11 | `infra/` |
| 4 | المراقبة والـ scaling والأمان | 12، 13، 14 | `deploy/monitoring/`، `loadtest/`، `scripts/` |

---

## 20. فهرس التوثيق

| الملف | فيه إيه |
|---|---|
| [README.md](../README.md) | نظرة عامة وحالة المشروع |
| [docs/architecture.md](architecture.md) | التصميم الكامل والقرارات المعمارية (ADRs) ومعايير القبول |
| [docs/local-development.md](local-development.md) | Docker بالتفصيل |
| [docs/kubernetes-local.md](kubernetes-local.md) | Kubernetes المحلي |
| [docs/gitops-local.md](gitops-local.md) | ArgoCD المحلي |
| [docs/infrastructure.md](infrastructure.md) | Terraform و AWS والتكلفة |
| [docs/gitops-aws.md](gitops-aws.md) | النشر على EKS |
| [docs/observability.md](observability.md) | المراقبة |
| [docs/autoscaling.md](autoscaling.md) | الـ scaling والأعطال |
| [docs/security.md](security.md) | الأمان |
| [docs/evaluation/results.md](evaluation/results.md) | النتايج النهائية |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | طريقة الشغل على الـ repo |

</div>
