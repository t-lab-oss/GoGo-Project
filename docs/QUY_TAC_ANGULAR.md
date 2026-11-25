# QUY TẮC TỔ CHỨC CODE ANGULAR (theo các bài đã học)

> Rút ra từ codebase `LearnAngular` (`app/`, `my-app/`, `Homework/`, server Express).
> Phiên bản: Angular 22, TypeScript 6, Bootstrap 5, RxJS 7.8. Kiểu code: **NgModule (standalone: false) + Signals**.
> Dùng cho bài kiểm tra thực hành: cứ làm đúng theo thứ tự và mẫu bên dưới.

> **Bản gộp:** kết hợp code thật trong codebase (tên file, mẫu code) với bộ quy tắc "Phát Triển Web Angular, NodeJS & MongoDB"
> (nguyên tắc kiến trúc, bảo mật, lưu ảnh). Khi hai nguồn khác nhau, **tên file/class theo code thật** (xem mục 2.2).

---

## 0A. NGUYÊN TẮC KIẾN TRÚC HỆ THỐNG (Angular + NodeJS + MongoDB)

Ứng dụng kinh doanh/thương mại điện tử theo kiến trúc Full-Stack: **Angular** (Client) + **NodeJS/ExpressJS/MongoDB** (Server).

- **Separation of Concerns:** UI (component), logic dữ liệu (service), model (classes), lưu trữ (database) tách riêng.
- **SPA (Single Page Application):** chuyển trang bằng Angular Router, không tải lại cả trang từ server.
- **Stateless:** HTTP không nhớ trạng thái; duy trì phiên bằng Cookie/Session/Token đúng quy tắc bảo mật (mục 13).
- **Defense in Depth:** validation và kiểm tra quyền thực hiện **song song ở cả Angular lẫn NodeJS**, không tin dữ liệu từ client.
- File cấu hình gốc (`angular.json`, `package.json`, `tsconfig.json`) **không chứa logic nghiệp vụ**, được quản lý bằng Git.
  Đồng bộ `package-lock.json` trong nhóm để tránh lệch phiên bản.
- `public/` chỉ chứa file tĩnh không qua biên dịch (favicon, logo, json mẫu). `styles.css` chỉ chứa style **dùng chung**,
  style riêng của component để trong `.css` của component đó.

---

## 0. TÓM TẮT 12 QUY TẮC VÀNG

1. Tạo bằng **Angular CLI** (`ng new`, `ng g c`, `ng g s`), không tự tạo file tay.
2. Dùng **NgModule**: mọi component khai báo trong `app-module.ts` (`standalone: false`).
3. **Mỗi component một thư mục**, 4 file cùng tên: `.ts` `.html` `.css` `.spec.ts`.
4. Tên thư mục/file **kebab-case**, tên class **PascalCase**, selector có tiền tố `app-`.
5. Dữ liệu, kiểu (model) đặt trong `classes/`; gọi API/xử lý dữ liệu đặt trong `services/`.
6. Component **không gọi `HttpClient` trực tiếp**; luôn đi qua service.
7. Service: `@Injectable({ providedIn: 'root' })`, inject `HttpClient` qua **constructor**.
8. Trạng thái trong component dùng **`signal()`**; đọc bằng `x()` trong html, ghi bằng `.set()` / `.update()`.
9. Template dùng cú pháp mới **`@if` / `@for (… ; track …)` / `@else` / `@empty`**.
10. Mọi route khai báo trong `app-routing-module.ts`; route `'**'` (not found) để **cuối cùng**.
11. Gọi API qua **đường dẫn tương đối** (`/books`, `/fashions`) + `proxy.conf.json`, không hard-code `http://localhost:...` trong service.
12. Bắt lỗi bằng `catchError` + `throwError`, hiển thị bằng `errMessage` signal.

---

## 1. TẠO PROJECT

### 1.1 Tạo project mới

```bash
ng new my-app --no-standalone --routing --ssr=false
```

- `--no-standalone`: dùng NgModule (khớp các bài đã học).
- `--routing`: sinh sẵn `app-routing-module.ts`.
- `--ssr=false`: tắt SSR.

Nếu không gõ cờ, CLI sẽ hỏi; chọn như các bài đã học:

| Câu hỏi | Chọn |
| --- | --- |
| Stylesheet format | **CSS** |
| Enable SSR / SSG | **No** |
| AI tools | **None** |

Sau đó:

```bash
cd my-app
npm install bootstrap jquery      # nếu đề yêu cầu giao diện Bootstrap
ng serve                          # chạy http://localhost:4200
ng serve -o                       # chạy và tự mở trình duyệt (--open)
```

### 1.2 BẮT BUỘC: cấu hình để CLI sinh component kiểu NgModule

Project học đặt trong `angular.json` → `projects.<tên>.schematics`:

```json
"schematics": {
  "@schematics/angular:component": { "standalone": false },
  "@schematics/angular:directive": { "standalone": false },
  "@schematics/angular:pipe":      { "standalone": false }
}
```

Nếu `ng new` ra project standalone, hãy chọn **không standalone** (hoặc thêm đoạn trên) để `ng g c` tự sinh `standalone: false`.
Nếu đề **cho sẵn project** thì giữ nguyên cấu hình của project đó.

### 1.3 Thêm Bootstrap + jQuery (`angular.json` → `build.options`)

```json
"styles": [
  "node_modules/bootstrap/dist/css/bootstrap.min.css",
  "src/styles.css"
],
"scripts": [
  "node_modules/jquery/dist/jquery.min.js",
  "node_modules/bootstrap/dist/js/bootstrap.bundle.min.js"
]
```

**Bootstrap đứng trước `src/styles.css`** để style của mình đè được Bootstrap (ngược lại link thành xanh gạch chân, token bị ghi đè).
Sửa `angular.json` xong phải **dừng và chạy lại `ng serve`**.

### 1.4 File cấu hình mặc định giữ nguyên

- `.prettierrc`: `printWidth: 100`, `singleQuote: true`, parser `angular` cho `*.html`.
- `.editorconfig`: indent **2 space**, UTF-8, nháy đơn trong `.ts`.
- `tsconfig.json`: không sửa (đã có `strict` kiểu Angular).

### 1.5 Cấu trúc thư mục chuẩn

```
my-app/
├─ angular.json
├─ package.json
├─ public/                         ← file tĩnh (ảnh, json). Truy cập: 'datasets/x.json'
│   └─ datasets/products1.json
└─ src/
   ├─ index.html
   ├─ main.ts                      ← bootstrapModule(AppModule)
   ├─ styles.css                   ← CSS toàn cục
   ├─ proxy.conf.json              ← proxy tới server API
   └─ app/
      ├─ app.ts / app.html / app.css / app.spec.ts      ← root component
      ├─ app-module.ts             ← khai báo component, import module, provider
      ├─ app-routing-module.ts     ← toàn bộ route
      ├─ classes/                  ← model, interface, helper, guard
      │   ├─ Fashion.ts   Book.ts   Iproduct.ts   UserLogin.ts
      │   ├─ SlugHelper.ts         ← hàm tiện ích
      │   └─ auth.ts               ← authGuard
      ├─ services/                 ← mọi service (gọi API)
      │   ├─ fashion-apiservice.ts   (+ .spec.ts)
      │   └─ book-apiservice.ts
      ├─ fashion-component/        ← 1 component = 1 thư mục
      │   ├─ fashion-component.ts
      │   ├─ fashion-component.html
      │   ├─ fashion-component.css
      │   └─ fashion-component.spec.ts
      └─ contact/ ...
```

Bài tập theo chương (như `Homework/`) thì gom theo **thư mục bài**:

```
src/app/Bai18/
   ├─ customers/          ← component
   └─ services/           ← service của riêng bài đó
```

---

## 2. TẠO COMPONENT

### 2.1 Lệnh

```bash
ng g c fashion-component        # đặt tên có hậu tố -component (kiểu đa số bài)
ng g c contact                  # hoặc tên ngắn gọn (contact, parent, child, homework)
```

CLI tạo 4 file trong thư mục cùng tên **và tự thêm vào `declarations` của `app-module.ts`**.
Luôn kiểm tra lại `app-module.ts` sau khi tạo.

### 2.2 Quy ước đặt tên

| Thứ | Quy ước | Ví dụ |
| --- | --- | --- |
| Thư mục & file | kebab-case | `fashion-new-component/` |
| Class | PascalCase, bỏ dấu `-` | `FashionNewComponent` |
| Selector | `app-` + tên thư mục | `app-fashion-new-component` |
| Class tên ngắn | PascalCase | `Contact`, `Parent`, `Homework` |
| Hành động CRUD | `<entity>-new/-update/-delete/-detail/-search` | `fashion-delete-component` |

> **Lưu ý tên file:** CLI bản 22 **không** thêm `.component.` vào tên file. Đúng: `contact/contact.ts`, `fashion-component/fashion-component.ts`.
> (Tài liệu cũ ghi `*.component.ts`, `app.component.*`, `ContactComponent` là kiểu Angular đời cũ; root component trong bài là `app.ts`.)
> Chỉ app standalone `admin-fashion` mới dùng tên `xxx.component.ts`.

> Quy ước CRUD trong bài: list = `xxx-component`, thêm = `xxx-new-component`, sửa = `xxx-update-component`,
> xoá = `xxx-delete-component`, xem 1 mục = `xxx-detail-component`, tìm = `xxx-search-component`.

### 2.3 Khung component chuẩn (`.ts`)

```ts
import { Component, signal } from '@angular/core';
import { FashionAPIService } from '../services/fashion-apiservice';
import { Fashion } from '../classes/Fashion';

@Component({
  selector: 'app-fashion-component',
  standalone: false,
  templateUrl: './fashion-component.html',
  styleUrl: './fashion-component.css',
})
export class FashionComponent {
  fashions = signal<Fashion[]>([]);
  errMessage = signal('');

  constructor(private _service: FashionAPIService) {
    this._service.getFashions().subscribe({
      next: (data) => this.fashions.set(data),
      error: (err) => this.errMessage.set(err.message ?? err),
    });
  }
}
```

Quy tắc trong class:

- Thứ tự: **thuộc tính (signal / model) → constructor → `ngOnInit` → hàm xử lý sự kiện → hàm private/helper**.
- Inject service bằng **constructor**: `constructor(private _service: XxxService)`.
  Tên biến service có `_` đầu (`_service`, `_http`) hoặc `private readonly`.
- Danh sách / dữ liệu hiển thị: `signal<Kiểu[]>([])`.
- Thông báo lỗi: luôn có `errMessage = signal('')`.
- Model dùng với `[(ngModel)]`: **object thường** (`fashion = new Fashion()`), không bọc signal.
- Gọi `subscribe` luôn viết dạng object `{ next, error }`.
- Biến/hàm dùng trong html thì để `public` (mặc định); `protected` chỉ ở `App`.
- Nạp dữ liệu ban đầu: trong constructor hoặc `ngOnInit()` (thêm `implements OnInit` nếu dùng).

### 2.4 Khung template (`.html`)

```html
{{ errMessage() }}
<table border="1">
  <tr>
    <td>Id</td>
    <td>Subject</td>
  </tr>
  <tbody>
    @for (f of fashions(); track f._id) {
      <tr>
        <td>{{ f._id }}</td>
        <td>{{ f.fashion_subject }}</td>
      </tr>
    } @empty {
      <tr><td colspan="2">Not found</td></tr>
    }
  </tbody>
</table>
```

Quy tắc:

- Đọc signal: `fashions()`, `errMessage()`, `book()?.BookName` (có `?.` nếu có thể `null`).
- Điều kiện: `@if (x() != null) { … } @else { … }`.
- Lặp: `@for (item of list(); track item.id) { … } @empty { … }` – **bắt buộc có `track`**.
- Ảnh: `<img [src]="..." [alt]="..." width="100" height="100" />`.
  Ghép chuỗi cũng dùng được: `src="{{ server_images_link }}/{{ book.Image }}"`.
- Class / style động: `[class.btn-saved]="isSaved"`, `[ngClass]="fn(x)"`, `[style.color]="..."`.
- Sự kiện: `(click)="hamXuLy()"`, `(change)="onFileSelected($event)"`, `(keyup.enter)="search()"`.
- Lấy giá trị ô nhập không cần ngModel: dùng **template reference variable**
  `<input #bookId /> <button (click)="searchBook(bookId.value)">`.
- Bảng dùng HTML thuần (`<table border="1">`) hoặc Bootstrap (`class="form-control"`, `btn btn-primary`…).
- Mỗi `.html` **không** cần dòng `xxx works!` — xoá dòng sinh sẵn đó khi nộp.

### 2.5 CSS component

- CSS riêng của component viết trong `.css` cùng thư mục (`styleUrl`, **số ít**).
- CSS dùng chung toàn app viết ở `src/styles.css`.

### 2.6 File `.spec.ts`

Giữ file CLI sinh ra. Với NgModule thì test dùng `declarations: [Xxx]` (không `imports`):

```ts
await TestBed.configureTestingModule({ declarations: [FashionComponent] }).compileComponents();
```

---

## 3. TẠO SERVICE

### 3.1 Lệnh

```bash
ng g s services/fashion-apiservice
ng g s services/product-service
```

Luôn **đặt trong thư mục `services/`**. File: `kebab-case.ts` (+ `.spec.ts`).

### 3.2 Đặt tên class

| Loại | Ví dụ file | Ví dụ class |
| --- | --- | --- |
| Gọi API server | `book-apiservice.ts` | `BookAPIService` |
| Gọi API server | `fashion-apiservice.ts` | `FashionAPIService` |
| Đọc file json tĩnh | `product-http-service.ts` | `ProductHttpService` |
| Có xử lý lỗi | `product-http-handle-error-service.ts` | `ProductHttpHandleErrorService` |
| Dữ liệu cứng | `product-service.ts` | `ProductService` |

### 3.3 Khung service gọi API (CRUD) – mẫu chuẩn

```ts
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, retry, throwError } from 'rxjs';
import { Fashion } from '../classes/Fashion';

@Injectable({ providedIn: 'root' })
export class FashionAPIService {
  headers = new HttpHeaders().set('Content-Type', 'text/plain;charset=utf-8');
  requestOptions: Object = { headers: this.headers, responseType: 'text' };

  constructor(private _http: HttpClient) {}

  getFashions(): Observable<any> {
    return this._http.get<any>('/fashions', this.requestOptions).pipe(
      map((res) => JSON.parse(res) as Array<Fashion>),
      retry(3),
      catchError(this.handleError),
    );
  }

  getFashion(id: string): Observable<any> {
    return this._http.get<any>('/fashions/' + id, this.requestOptions).pipe(
      map((res) => JSON.parse(res) as Fashion),
      retry(3),
      catchError(this.handleError),
    );
  }

  postFashion(aFashion: Fashion): Observable<Fashion> {
    return this._http.post<Fashion>('/fashions', aFashion).pipe(catchError(this.handleError));
  }

  putFashion(aFashion: Fashion): Observable<Fashion> {
    return this._http.put<Fashion>('/fashions', aFashion).pipe(catchError(this.handleError));
  }

  deleteFashion(id: string): Observable<any> {
    return this._http.delete<any>('/fashions/' + id, this.requestOptions).pipe(
      map((res) => JSON.parse(res) as Fashion),
      retry(3),
      catchError(this.handleError),
    );
  }

  handleError(error: HttpErrorResponse) {
    return throwError(() => new Error(error.message));
  }
}
```

Quy tắc:

- Tên hàm theo động từ HTTP: `getXxxs()`, `getXxx(id)`, `postXxx(obj)`, `putXxx(obj)`, `deleteXxx(id)`.
- Luôn `return` về `Observable`; **không subscribe trong service**.
- Pipe theo thứ tự: `map` → `retry(3)` → `catchError(this.handleError)`.
- Có `handleError(error: HttpErrorResponse)` trả `throwError(() => new Error(error.message))`.
- URL tương đối (`'/fashions'`), hoặc `private _url = 'datasets/products1.json'` cho file tĩnh trong `public/`.
- Với biến `private readonly`: `private readonly _url = '...'`.

### 3.4 Service dữ liệu cứng (không gọi API)

```ts
@Injectable({ providedIn: 'root' })
export class ProductService {
  products: Product[] = [ /* ... */ ];
  constructor() {}
  getProducts() { return this.products; }
}
```

Bài tập theo chương (`Homework`) có thể dùng `@Injectable()` rồi khai báo trong `providers: [CatalogService]` của `app-module.ts`. Nếu dùng `providedIn: 'root'` thì **không** cần khai báo providers.

---

## 4. TẠO MODEL / INTERFACE / HELPER (`classes/`)

Tạo bằng CLI: `ng g i classes/Iproduct` (interface) hoặc `ng g class classes/Fashion` (class).

### 4.1 Hai kiểu model

**Interface** – chỉ mô tả hình dạng dữ liệu nhận về (tên file `Iproduct.ts`, `IFakeProduct.ts`):

```ts
export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
}
```

**Class có giá trị mặc định** – dùng khi cần `new` + binding form (`Fashion.ts`, `Book.ts`, `UserLogin.ts`):

```ts
export class Fashion {
  constructor(
    public _id: string | null = null,
    public style: string = '',
    public fashion_subject: string = '',
    public fashion_detail: string = '',
    public fashion_image: string = '',
    public created_at: Date | string = new Date(),
  ) {}
  getBase64String() { /* ... */ }
}
```

Quy tắc:

- Class: dùng **parameter properties** (`public x: kiểu = mặc định`) trong constructor.
- Tên file model **PascalCase** theo tên class: `Fashion.ts`, `Book.ts`, `UserLogin.ts`.
- Tên thuộc tính **giữ nguyên theo dữ liệu server** (`BookId`, `fashion_subject`, `_id`) — không đổi sang camelCase.
- Dữ liệu JSON trả về là object thường, **không có method**. Muốn gọi method của class thì khôi phục:
  `const f = Object.assign(new Fashion(), data);`
- Hàm tiện ích thuần (slug, …) để trong `classes/` dạng `export function` (file `SlugHelper.ts`).
- Guard cũng để trong `classes/` (file `auth.ts`).

---

## 5. ĐĂNG KÝ TRONG `app-module.ts`

```ts
@NgModule({
  declarations: [App, Contact, FashionComponent /* ... mọi component */],
  imports: [BrowserModule, AppRoutingModule, FormsModule, ReactiveFormsModule],
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient(withInterceptorsFromDi())],
  bootstrap: [App],
})
export class AppModule {}
```

| Cần dùng | Phải có |
| --- | --- |
| `[(ngModel)]`, `#f="ngForm"` | `FormsModule` trong `imports` |
| `[formGroup]`, `formControlName` | `ReactiveFormsModule` trong `imports` |
| `HttpClient` | `provideHttpClient(...)` trong `providers` |
| `routerLink`, `<router-outlet>` | `AppRoutingModule` trong `imports` |
| `*ngIf`, `*ngFor`, `ngClass`, pipe | tự có nhờ `BrowserModule` |

Lỗi hay gặp: quên khai báo component → `is not a known element`; quên `FormsModule` → `Can't bind to 'ngModel'`;
quên `provideHttpClient` → `NullInjectorError: No provider for HttpClient`.

`main.ts` (NgModule):

```ts
import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';

platformBrowser().bootstrapModule(AppModule).catch((err) => console.error(err));
```

---

## 6. ROUTING (`app-routing-module.ts`)

```ts
const routes: Routes = [
  { path: '', component: Contact },                       // trang chủ
  { path: 'fashion-list', component: FashionComponent },
  { path: 'fashion-new', component: FashionNewComponent },
  { path: 'products/:id', component: ProductDetailComponent },   // có tham số
  {
    path: 'sample-nested',                                 // route lồng
    component: ProductListAdvancedComponent,
    children: [
      { path: 'search', component: ProductListSearchComponent },
      { path: 'detail/:id', component: ProductDetailComponent },
    ],
  },
  {
    path: 'lazyinfo',                                      // lazy + guard
    loadComponent: () => import('./lazy-component/lazy-component').then((c) => c.LazyComponent),
    canActivate: [authGuard],
  },
  { path: '', redirectTo: 'customers', pathMatch: 'full' },  // redirect mặc định (nếu đề yêu cầu; pathMatch: 'full' bắt buộc)
  { path: 'admin', component: ProductListComponent, canActivate: [authGuard] }, // route cần đăng nhập
  { path: '**', component: PayNotFoundComponents },          // LUÔN CUỐI CÙNG
];

@NgModule({ imports: [RouterModule.forRoot(routes)], exports: [RouterModule] })
export class AppRoutingModule {}
```

Quy tắc:

- **Path viết kebab-case, không có dấu `/` đầu**: `'fashion-list'`.
- Path đặt theo tên chức năng: `fashion-list`, `fashion-detail`, `fashion-new`, `fashion-update`, `fashion-delete`, `fashion-search`, `book-list`, `book-detail`, `book-new`.
- Route **cụ thể đặt trước**, route chung/`**` đặt sau. (`products/:id` trước `products` nếu cần phân biệt.)
- **Path trong `routerLink` phải khớp đúng path trong routes** (đã từng sai: `/fakeproducts` vs `fake_product`).
- Lazy component phải `standalone: true`; chỉ route lazy mới dùng `loadComponent`.
- Menu đặt ở `app.html`, cuối file luôn có `<router-outlet />`:

```html
<a routerLink="/fashion-list">Lists Fashion</a> |
<a routerLink="/fashion-new">fashion-new</a>
<router-outlet />
```

### 6.1 Điều hướng bằng code, lấy tham số

```ts
constructor(private router: Router, private activateRoute: ActivatedRoute) {}

this.router.navigate(['/products', id]);                    // /products/5
this.router.navigate(['service-product-image-event', id]);  // tương đối root

this.activateRoute.paramMap.subscribe((param) => {          // path param  :id
  const id = param.get('id');
});
this.activateRoute.queryParamMap.subscribe((params) => {    // ?min=..&max=..
  const min = Number(params.get('min')) || 0;
});
this.router.navigate([], {
  relativeTo: this.activateRoute,
  queryParams: { min: 1, max: 9 },
  queryParamsHandling: 'merge',
});
```

### 6.2 Guard (`classes/auth.ts`)

```ts
export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  return isLoggedIn ? true : router.parseUrl('/contact');
};
```

Kiểu guard dạng **class** (tài liệu cũ, vẫn gặp trong đề): đặt tên `AuthGuard`, `@Injectable({ providedIn: 'root' })`,
`implements CanActivate`; chưa đăng nhập thì `this.router.navigate(['/login']); return false;`, đã đăng nhập thì `return true;`.
Trạng thái đăng nhập nên lấy từ `AuthService` (service) thay vì đọc `localStorage` trực tiếp trong guard.
Trong bài đã học dùng **hàm `authGuard`** ở trên; ưu tiên kiểu này, trừ khi đề yêu cầu class.

---

## 7. FORM

### 7.1 Template-driven (`FormsModule`) — dùng `[(ngModel)]` + model class

```html
<input type="text" class="form-control" name="style" id="style"
       placeholder="Input Style" [(ngModel)]="fashion.style" />
<button (click)="postFashion()">Submit</button>
```

- Mỗi input có `name` (bắt buộc với ngModel trong form) và `id`.
- Model: `fashion = new Fashion();` trong class.
- Form có kiểm tra:

```html
<form #loginForm="ngForm" (ngSubmit)="onLogin()">
  <input name="username" [(ngModel)]="user.username" #username="ngModel"
         required minlength="4"
         [class.is-invalid]="username.invalid && username.touched" />
  <small *ngIf="username.errors?.['required']">Vui lòng nhập tên đăng nhập.</small>
  <button type="submit" [disabled]="loginForm.invalid">Đăng nhập</button>
</form>
```

- Với signal: `[(ngModel)]="keyword"` hoạt động trực tiếp trên `keyword = signal('')`.
- `<select>`: giá trị số dùng `[ngValue]="5"`, chuỗi dùng `value="..."`.

### 7.2 Reactive (`ReactiveFormsModule`)

```ts
public regForm: FormGroup = new FormGroup({
  name: new FormControl('', [Validators.required, Validators.minLength(3)]),
  email: new FormControl('', [Validators.required, Validators.email]),
});
customerValidator(control: AbstractControl): { [key: string]: any } | null {
  return /[@#$%^&]/g.test(control.value) ? { namenoMatch: { value: control.value } } : null;
}
```

```html
<form [formGroup]="regForm">
  <input class="form-control" formControlName="name" />
  <div class="text-danger" *ngIf="regForm.get('name')?.invalid && regForm.get('name')?.touched">
    <small>Vui lòng nhập tên.</small>
  </div>
  <button type="submit" [disabled]="regForm.invalid">Đăng ký</button>
</form>
```

### 7.3 Upload ảnh → Base64 (dùng ở Fashion/Book)

```ts
onFileSelected(event: any, fashion: Fashion) {
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => { fashion.fashion_image = reader.result!.toString(); };
}
```

```html
<input type="file" (change)="onFileSelected($event, fashion)" />
```

---

## 8. KẾT NỐI SERVER: `proxy.conf.json`

Đặt tại `src/proxy.conf.json` và khai báo trong `angular.json` → `serve.options`:

```json
"serve": { "builder": "@angular/build:dev-server", "options": { "proxyConfig": "src/proxy.conf.json" } }
```

```json
[
  { "context": ["/books", "/books/**"], "target": "http://localhost:3000", "secure": false, "changeOrigin": true },
  { "context": ["/fashions"],           "target": "http://localhost:3002", "secure": true,  "changeOrigin": true, "logLevel": "debug" }
]
```

- `context` = tiền tố URL service gọi (`/fashions`); `target` = địa chỉ server.
- Đổi proxy → **restart `ng serve`**.
- Cổng server cần **khớp** với `target` (server bài Book: 3000, Fashion: 3002 hoặc 4000 tùy server đang chạy).
- Ảnh do server phục vụ (`/images/...`) trong component dùng biến: `server_images_link = 'http://localhost:3000/images'`.
- File json tĩnh đặt trong `public/` (vd `public/datasets/products1.json`), gọi `'datasets/products1.json'`; (Homework: `public/assets/data/…` gọi `'/assets/data/customers.json'`).

---

## 9. SERVER EXPRESS (`my-server`, `server`) — mẫu

```js
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));          // cho phép gửi ảnh base64
app.use(express.static(path.join(__dirname, "public")));
app.get("/books", (req, res) => res.send(database));
app.get("/books/:id", (req, res) => res.send(database.find((x) => x.BookId == req.params.id)));
app.post("/books", (req, res) => { /* push, trả danh sách mới */ });
app.listen(3000);
```

- Cài: `npm i express cors body-parser morgan` (+ `mongodb` nếu dùng MongoDB; xem mục 9B), chạy bằng `nodemon index.js`.
- Mẫu trên dùng mảng `database` trong bộ nhớ (bài Book đời đầu). Bài có MongoDB thì thay bằng collection (mục 9B).
- Route RESTful: `GET /xxx`, `GET /xxx/:id`, `POST /xxx`, `PUT /xxx/:id`, `DELETE /xxx/:id`.
- Trả lỗi bằng status: `400` (sai dữ liệu), `404` (không có), `201` (tạo mới).
- Thư mục `public/images` chứa ảnh tĩnh.

---

## 9B. KẾT NỐI MONGODB (MongoDB Compass)

### Thông số dùng trong codebase

| Thứ | Giá trị |
| --- | --- |
| Connection string (Compass và server dùng chung) | `mongodb://127.0.0.1:27017` (MongoDB cài trên máy) |
| Database | `FashionData` |
| Collection | `Fashion` (sản phẩm), `User` (tài khoản), `AuthSessions` (phiên đăng nhập), `Orders` (đơn hàng, tự tạo khi insert lần đầu) |
| Biến môi trường ghi đè | `MONGODB_URI`, `PORT`, `SESSION_SECRET`, `FRONTEND_ORIGIN` |

### Các bước

1. Bật dịch vụ MongoDB trên máy (phải chạy trước khi chạy server).
2. Mở **MongoDB Compass** → ô *URI* nhập `mongodb://127.0.0.1:27017` → **Connect**.
3. Trong Compass kiểm tra database `FashionData` và các collection ở bảng trên (Compass chỉ để xem/sửa dữ liệu, server không phụ thuộc Compass).
4. Cài driver trong thư mục server: `npm i mongodb`.
5. Viết kết nối trong `index.js` của server:

```js
const { MongoClient, ObjectId } = require("mongodb");
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

async function start() {
  const client = new MongoClient(mongoUri);
  await client.connect();                                   // kết nối 1 lần khi khởi động
  const database = client.db("FashionData");                // tên database
  const fashionCollection = database.collection("Fashion"); // tên collection
  createApp(fashionCollection).listen(port, () => console.log(`API on http://localhost:${port}`));
}
start().catch((err) => { console.error("Could not start MongoDB API:", err); process.exitCode = 1; });
```

6. Chạy server (`npm start` = `nodemon index.js`), rồi chạy `ng serve`.
7. Muốn có dữ liệu mẫu: `npm run seed` (thêm Fashion mẫu), `npm run migrate` (bổ sung `created_at` cho dữ liệu cũ). Hai script bỏ qua dữ liệu đã có.

### Thao tác CRUD với collection

```js
await collection.find({}).sort({ created_at: -1 }).toArray();          // lấy danh sách
await collection.findOne({ _id: new ObjectId(id) });                   // lấy 1 (id từ URL là chuỗi → ObjectId)
const r = await collection.insertOne(doc);  /* r.insertedId */         // thêm
await collection.updateOne({ _id: new ObjectId(id) }, { $set: fields });// sửa (matchedCount === 0 → 404)
await collection.deleteOne({ _id: new ObjectId(id) });                 // xoá
```

- Luôn kiểm tra `ObjectId.isValid(id)` trước khi `new ObjectId(id)`, sai thì trả `400`; không tìm thấy thì `404`.
- `_id` Mongo là kiểu `ObjectId`, sang Angular thành **chuỗi** → model Angular khai báo `_id: string | null`.
- Tạo index khi cần duy nhất: `createIndex({ IdF: 1 }, { unique: true })`.
- Đừng ghi đè `_id`, `created_at` khi `PUT` (chỉ `$set` các trường được phép sửa).
- Tách `createApp(collection)` khỏi `start()` để test được không cần MongoDB.

### Lỗi thường gặp

| Triệu chứng | Nguyên nhân |
| --- | --- |
| `MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017` | MongoDB chưa bật hoặc sai cổng |
| Compass thấy dữ liệu nhưng Angular rỗng | Sai tên database/collection trong `client.db()/collection()`, hoặc proxy trỏ sai cổng server |
| `Argument passed in must be a string of 12 bytes or 24 hex` | Đưa id sai định dạng vào `new ObjectId()` |
| Angular báo CORS / lỗi 403 | Server thiếu `cors()`, hoặc dùng cookie nhưng thiếu `credentials: true` + `origin` đúng |
| Ảnh Base64 bị cắt, lỗi `PayloadTooLargeError` | Thiếu `express.json({ limit: "50mb" })` |

---

## 9C. DỰNG SERVER MONGODB GIỐNG PROJECT `my-server-mongodb`

Đây là khuôn server + MongoDB của project (cổng **3002**, Angular gọi qua proxy). Làm theo từng bước là ra cùng cấu trúc.

### 9C.1 Tạo project server

```bash
mkdir my-server-mongodb && cd my-server-mongodb
npm init -y
npm i express cors cookie-parser express-session mongodb
npm i -D morgan nodemon
```

Cấu trúc thư mục:

```
my-server-mongodb/
├─ index.js            ← server: createApp() + start() + module.exports
├─ seed-fashion.js     ← thêm dữ liệu mẫu (chạy: npm run seed)
├─ migrate-fashion.js  ← bổ sung trường cho dữ liệu cũ (npm run migrate)
├─ index.test.js       ← test bằng node:test, không cần MongoDB thật
├─ package.json
└─ public/images/      ← ảnh tĩnh phục vụ qua express.static
```

`package.json` (chỉ phần scripts khác mặc định):

```json
"type": "commonjs",
"main": "index.js",
"scripts": {
  "start": "nodemon index.js",
  "seed": "node seed-fashion.js",
  "migrate": "node migrate-fashion.js",
  "test": "node --test"
}
```

> `mongoose`, `mongoclient`, `express-fileupload`, `body-parser` có trong `package.json` của project nhưng `index.js` **không dùng**;
> project chỉ dùng driver chính thức `mongodb`. Bạn không cần cài các gói đó.

### 9C.2 Khung `index.js` (pattern của project)

```js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const path = require("node:path");
const { MongoClient, ObjectId } = require("mongodb");

const port = Number(process.env.PORT || 3002);
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:4200";

// 1. createApp nhận collection từ ngoài vào → test được bằng collection giả
function createApp({ fashionCollection, userCollection, sessionCollection }) {
  const app = express();
  app.use(cors({ origin: frontendOrigin, credentials: true })); // cho Angular (4200) gọi + gửi cookie
  app.use(morgan("combined"));
  app.use(express.json({ limit: "50mb" }));                     // nhận ảnh Base64
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, "public")));

  const session = require("express-session");
  app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 1000 },
  }));

  app.get("/", (req, res) => res.send("This Web server is processed for MongoDB"));

  app.get("/fashions", async (req, res) => res.json(await fashionCollection.find({}).toArray()));

  app.get("/fashions/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid Fashion id" });
    const fashion = await fashionCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!fashion) return res.status(404).json({ error: "Fashion not found" });
    return res.json(fashion);
  });

  app.post("/fashions", async (req, res) => {
    const result = await fashionCollection.insertOne(req.body);
    return res.status(201).json({ ...req.body, _id: result.insertedId });
  });

  app.put("/fashions", async (req, res) => {              // Angular gửi _id trong body
    if (!ObjectId.isValid(req.body?._id)) return res.status(400).json({ error: "Invalid Fashion id" });
    const id = new ObjectId(req.body._id);
    const result = await fashionCollection.updateOne({ _id: id }, { $set: {
      style: req.body.style,
      fashion_subject: req.body.fashion_subject,
      fashion_detail: req.body.fashion_detail,
      fashion_image: req.body.fashion_image,
    }});
    if (result.matchedCount === 0) return res.status(404).json({ error: "Fashion not found" });
    return res.json(await fashionCollection.findOne({ _id: id }));
  });

  app.delete("/fashions/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid Fashion id" });
    const result = await fashionCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Fashion not found" });
    return res.status(204).end();
  });

  // middleware lỗi: đặt SAU tất cả route
  app.use((error, req, res, next) => {
    console.error("MongoDB API error:", error);
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

// 2. start(): kết nối Mongo 1 lần rồi mới listen
async function start() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const database = client.db("FashionData");
  const server = createApp({
    fashionCollection: database.collection("Fashion"),
    userCollection: database.collection("User"),
    sessionCollection: database.collection("AuthSessions"),
  }).listen(port, () => console.log(`My Server listening on http://localhost:${port}`));

  const shutdown = async () => { server.close(); await client.close(); };  // đóng sạch khi Ctrl+C
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

// 3. chỉ tự chạy khi gọi `node index.js`; khi test `require` thì không chạy
if (require.main === module) {
  start().catch((error) => { console.error("Could not start MongoDB API:", error); process.exitCode = 1; });
}

module.exports = { createApp };
```

Điểm cần nhớ:

- Kết nối `connect()` **một lần** lúc khởi động, không connect trong từng request.
- Express 5 tự bắt lỗi của handler `async` và chuyển xuống middleware lỗi (không cần `try/catch` từng route).
- `async` handler luôn `return res...` để tránh gửi phản hồi hai lần.
- Đăng nhập, đăng xuất, bảo vệ route bằng token (`requireAuth`), `isSameOrigin` là phần mở rộng trong project; bài thường chỉ cần phần trên + mục 13.

### 9C.3 Script nạp dữ liệu mẫu (`seed-fashion.js`)

Mỗi script CLI tự kết nối riêng, xong thì `client.close()` trong `finally`:

```js
const { MongoClient } = require("mongodb");
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

async function seed() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const collection = client.db("FashionData").collection("Fashion");
    const exists = await collection.findOne({ style: "Flex", fashion_subject: "Monochrome with a modern edge" });
    if (!exists) await collection.insertOne({ style: "Flex", fashion_subject: "...", fashion_detail: "<p>...</p>", fashion_image: "https://...", created_at: new Date() });
  } finally {
    await client.close();
  }
}
seed().catch((error) => { console.error("Could not seed:", error); process.exitCode = 1; });
```

- Seed/migrate phải **chạy lại nhiều lần vẫn an toàn**: kiểm tra `findOne` trước khi thêm, chỉ cập nhật bản ghi còn thiếu (`{ created_at: { $exists: false } }`).
- Migrate nhiều bản ghi dùng `collection.bulkWrite([{ updateOne: { filter, update } }, ...])`.

### 9C.4 Phía Angular (khớp với server trên)

1. `src/proxy.conf.json` chuyển tiếp tới cổng 3002:

```json
{ "context": ["/fashions", "/user-login"], "target": "http://localhost:3002", "secure": true, "changeOrigin": true, "logLevel": "debug" }
```

2. `angular.json` → `serve.options.proxyConfig = "src/proxy.conf.json"`; `app-module.ts` có `provideHttpClient(...)`.
3. Service gọi đường dẫn tương đối `'/fashions'` (mục 3.3). Model `Fashion` có `_id: string | null`.
4. Thứ tự chạy: **bật MongoDB → `npm start` (server) → `npm run seed` (nếu cần) → `ng serve`**. Mở Compass để xem dữ liệu trong `FashionData.Fashion`.
5. Kiểm tra nhanh server trước khi mở Angular: mở `http://localhost:3002/fashions` trên trình duyệt phải thấy mảng JSON.

### 9C.5 Test không cần MongoDB (`node --test`)

Project dùng lớp `MemoryCollection` giả lập `find().toArray()`, `findOne`, `insertOne`, `updateOne`, `deleteOne` rồi gọi:

```js
const { createApp } = require("./index");
const app = createApp({ fashionCollection: new MemoryCollection([...]) });
const server = app.listen(0);        // cổng ngẫu nhiên
// fetch(`http://127.0.0.1:${server.address().port}/fashions`) ...
```

Chạy: `npm test`. Đây là lý do `createApp` nhận collection từ ngoài thay vì tự connect bên trong.

---

## 10. PIPE, BINDING, VÒNG ĐỜI — CÚ PHÁP CẦN NHỚ

| Mục đích | Cú pháp |
| --- | --- |
| Interpolation | `{{ name }}` |
| Property binding | `[value]="name"`, `[disabled]="isDisabled"`, `[src]="url"` |
| Class binding | `[class.btn-saved]="isSaved"` / `[ngClass]="..."` |
| Style binding | `[style.color]="color"` |
| Event binding | `(click)="fn()"` |
| Two-way | `[(ngModel)]="obj.field"` |
| Template ref | `#view`, `#view_hsa` → dùng `view_hsa.value` |
| Pipe | `{{ 'text' \| uppercase }}`, `{{ d \| date }}` |
| `@Input` | `@Input() receivedData: string = '';` (child) / `<app-child [receivedData]="x">` (parent) |
| Vòng đời | `ngOnInit(): void { … }` + `implements OnInit` |

Dùng `ChangeDetectorRef.detectChanges()` chỉ khi dữ liệu không tự cập nhật lên giao diện (như bài Customers khi không dùng signal).

---

## 11. QUY TRÌNH LÀM BÀI CRUD ĐIỂN HÌNH (Fashion/Book) — LÀM ĐÚNG THỨ TỰ

1. `ng new` → cấu hình `standalone: false`, thêm Bootstrap nếu cần.
2. Tạo `classes/Xxx.ts` (class có giá trị mặc định đúng tên field server).
3. `ng g s services/xxx-apiservice` → viết `get / getOne / post / put / delete` + `handleError`.
4. Thêm đoạn proxy vào `src/proxy.conf.json` + khai báo trong `angular.json`.
5. `ng g c xxx-component` (list) → `signal` danh sách + `errMessage`, bảng `@for`.
6. `ng g c xxx-detail-component` → ô nhập Id + nút Search, `@if … @else`.
7. `ng g c xxx-new-component` → form `ngModel`, upload ảnh, `postXxx()`.
8. `ng g c xxx-update-component` → như new nhưng có ô `_id`, gọi `putXxx()`.
9. `ng g c xxx-delete-component` → bảng + nút Delete, `window.confirm`, `fashions.update(list => list.filter(...))`.
10. Kiểm tra `app-module.ts` (declarations, `FormsModule`, `provideHttpClient`).
11. Thêm route vào `app-routing-module.ts` (`'**'` cuối cùng) + link menu vào `app.html`.
12. Chạy server → `ng serve` → thử từng chức năng. Khi sửa proxy/angular.json phải restart.

### Mẫu thao tác hay gặp

```ts
// Tìm kiếm/lọc phía client
this.results.set(this.allFashions.filter(f => f.style === this.style()));

// Xoá xong cập nhật danh sách ngay, không gọi lại API
this.fashions.update((list) => list.filter((f) => f._id !== id));

// Xác nhận trước khi xoá
if (window.confirm('Are you sure you want to delete this Fashion?')) { /* ... */ }
```

---

## 12. TÁCH 2 ỨNG DỤNG TRONG CÙNG WORKSPACE (admin / client)

Nếu đề yêu cầu nhiều app (như `admin-fashion`, `client-fashion`):

```bash
ng g application admin-fashion --style=css --routing --ssr=false
ng g application client-fashion --style=css --routing --ssr=false
```

- App sinh ra nằm trong `projects/<tên>/`, mỗi app có `proxy.conf.json` và **port riêng**
  (`"serve": { "options": { "port": 4001, "proxyConfig": "projects/admin-fashion/proxy.conf.json" } }`).
- Thêm script vào `package.json`: `"start:admin-fashion": "ng serve admin-fashion"`, `"build:admin-fashion": "ng build admin-fashion"`.
- Các app này trong bài dùng **standalone** (có `app.config.ts`, `app.routes.ts`, `imports: [...]` trong component,
  `inject()` thay constructor, tên file `xxx.component.ts` / `xxx.service.ts`). Chỉ dùng kiểu này khi project ấy được tạo mặc định kiểu standalone;
  **app chính (`src/`) vẫn dùng NgModule**.

---

## 13. XÁC THỰC & BẢO MẬT (phía NodeJS/Express)

> Server `my-server-mongodb/index.js` đã có thật: `express-session` + cookie (`httpOnly`, `sameSite: 'lax'`, `secure` khi production),
> đăng nhập `POST /user-login`, đăng xuất `POST /user-logout`, băm mật khẩu **scrypt + salt** (module `crypto` có sẵn của Node), giỏ hàng lưu session.
> Riêng login phía Angular (`login-component`) và `authGuard` chỉ giả lập bằng `localStorage`.
> Đề thi cho dùng thư viện nào (`bcrypt` hay `crypto.scrypt`) thì dùng thư viện đó.

### 13.1 Cookie xác thực — bắt buộc đủ 3 thuộc tính

```javascript
res.cookie('connect.sid', sessionId, {
  httpOnly: true,     // JS phía client không đọc được (chống XSS)
  secure: true,       // chỉ gửi qua HTTPS
  sameSite: 'strict', // không gửi từ trang web khác (chống CSRF)
  maxAge: 3600000,    // thời gian sống (ms)
});
```

### 13.2 Session

- Dữ liệu session (giỏ hàng, thông tin đăng nhập) lưu **ở server**; client chỉ giữ **Session ID** dưới dạng Cookie.
- **Logout** phải làm cả hai: `req.session.destroy()` (hủy trên server) **và** `res.clearCookie('connect.sid')` (dọn cookie client).
- **Chống Session Fixation:** gọi `req.session.regenerate()` ngay sau khi đăng nhập thành công để cấp Session ID mới.

### 13.3 Mật khẩu

- Không lưu plain-text, không dùng mã hóa hai chiều. Dùng băm một chiều **`bcrypt`** (hoặc `argon2`, `pbkdf2`) kèm **salt** (chống Rainbow Table).

```javascript
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash(rawPassword, 10);   // 10 = saltRounds
await db.collection('users').insertOne({ username, password: hashedPassword });
// Đăng nhập: await bcrypt.compare(rawPassword, user.password)
```

---

## 14. CHIẾN LƯỢC LƯU HÌNH ẢNH

| Tiêu chí | 1. File vật lý trên server (khuyên dùng) | 2. Base64 trong MongoDB | 3. Cloud (S3, Cloudinary) |
| --- | --- | --- | --- |
| Vị trí | `public/images/` trên server | Trong document MongoDB | CDN đám mây |
| CSDL lưu | Tên file (`p1.png`) hoặc URL tương đối | Chuỗi Base64 dài | URL tuyệt đối từ CDN |
| Dung lượng DB | Rất nhẹ | Tăng ~33%, dễ vượt giới hạn 16MB/document | Rất nhẹ |
| Tốc độ | Rất nhanh (`express.static`) | Chậm do parse chuỗi lớn | Rất nhanh (CDN) |
| Dùng khi | Bài tập lớn, web vừa và nhỏ | Thumbnail rất nhỏ | Production quy mô lớn |

Trong codebase: **bài Book** dùng cách 1 (client gửi `ImageBase64` + tên file, server ghi `public/images/<BookId>.png`, DB lưu tên file,
client hiển thị `server_images_link + '/' + book.Image`); **bài Fashion** dùng cách 2 (`fashion_image` là Base64 lưu thẳng trong MongoDB).
Đề yêu cầu cách nào thì làm cách đó; mặc định ưu tiên cách 1.

Phía server nhận ảnh Base64 cần `express.json({ limit: "50mb" })`; cắt header trước khi ghi file:
`base64.replace(/^data:image\/\w+;base64,/, "")`, rồi `fs.writeFileSync(path, data, "base64")`.

---

## 15. DANH SÁCH TỰ KIỂM TRA TRƯỚC KHI NỘP

- [ ] `ng serve` build không lỗi, mở trình duyệt không lỗi đỏ ở Console.
- [ ] Component mới đã có trong `declarations` của `app-module.ts`.
- [ ] Có `FormsModule` (nếu dùng ngModel) và `provideHttpClient` (nếu gọi API).
- [ ] Route đã thêm, `**` ở cuối; `routerLink` khớp path.
- [ ] Tên thư mục/file kebab-case, class PascalCase, selector `app-…`.
- [ ] Service nằm trong `services/`, model nằm trong `classes/`.
- [ ] Component không dùng `HttpClient` trực tiếp.
- [ ] Mỗi `@for` có `track`; signal đọc bằng `()`.
- [ ] Có `errMessage` hiển thị lỗi; service có `catchError`.
- [ ] Đã xoá dòng `xxx works!`, `console.log` thừa, code comment dư.
- [ ] Proxy/cổng server khớp; server đang chạy.
- [ ] Chạy `npx prettier --write src` (nếu có) để format đồng nhất.
- [ ] Cookie xác thực có đủ `HttpOnly`, `Secure`, `SameSite`.
- [ ] Logout xóa cả session server (`destroy`) lẫn cookie client (`clearCookie`); đăng nhập xong có `regenerate()`.
- [ ] Mật khẩu băm `bcrypt` + salt trước khi lưu MongoDB.
- [ ] Ảnh: DB chỉ lưu tên/đường dẫn (cách 1 hoặc 3), hoặc Base64 nếu đề yêu cầu.
- [ ] Validation có cả ở Angular lẫn NodeJS.

---

## 16. LỖI ĐÃ GẶP TRONG CODEBASE — ĐỪNG LẶP LẠI

| Lỗi | Cách đúng |
| --- | --- |
| `<input type="number" />[[(ngModel)]="hsa"` (gõ nhầm thành text) | `<input type="number" [(ngModel)]="hsa" />` |
| `routerLink="/fakeproducts"` nhưng route là `fake_product` | Link phải đúng path trong routes |
| `disabled="isDisabled"` (thành chuỗi) | `[disabled]="isDisabled"` |
| `<option>{{ p.name }}></option>` thừa `>` | `<option [value]="p.id">{{ p.name }}</option>` |
| `colspan="3"` cho bảng 5 cột | `colspan` bằng đúng số cột |
| `errMessage.set(err)` (err là Error) | `errMessage.set(err.message)` |
| Hard-code `http://localhost:3000` trong service | URL tương đối + proxy (riêng link ảnh server thì dùng biến) |
| Quên `track` hoặc dùng `track $index` khi có id | `track item.id` |
| `@Input` mà không khai báo child trong module | Khai báo cả Parent và Child trong `declarations` |

---

*Tài liệu rút từ code thật trong `app/`, `my-app/`, `Homework/`, `my-server/`, `server/`, gộp với bộ quy tắc Angular + NodeJS + MongoDB.
Khi đề bài yêu cầu khác (standalone, tên khác), ưu tiên đề bài; còn lại giữ đúng khuôn trên.*
