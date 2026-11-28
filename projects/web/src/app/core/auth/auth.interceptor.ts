import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { isNetworkError } from '../offline/network';
import { AuthService } from './auth.service';

const withToken = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

/** Gắn Bearer token. Gặp 401 UNAUTHENTICATED thì làm mới phiên một lần rồi gửi lại. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isSessionCall = req.url.startsWith('/api/sessions');
  const token = auth.accessToken();
  const outgoing = token && !isSessionCall ? withToken(req, token) : req;

  return next(outgoing).pipe(
    catchError((err: unknown) => {
      const expired =
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        err.error?.error?.code === 'UNAUTHENTICATED' &&
        !isSessionCall;
      if (!expired) return throwError(() => err);

      return auth.refresh().pipe(
        switchMap((fresh) => next(withToken(req, fresh))),
        catchError((refreshError: unknown) => {
          // Mất mạng giữa chừng không phải hết phiên: giữ đăng nhập, để nơi gọi tự thử lại.
          if (isNetworkError(refreshError)) return throwError(() => refreshError);
          auth.clear();
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          return throwError(() => err);
        }),
      );
    }),
  );
};
