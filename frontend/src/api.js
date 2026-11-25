// Tiny fetch wrapper for the PHP API. Sends the session cookie, parses JSON, throws ApiError with a
// message that is safe to show to the user.

const BASE = import.meta.env.VITE_API_BASE ?? `${import.meta.env.BASE_URL}api`;

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const init = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) {
    init.body = body; // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    // index.php?r=... works on any Apache setup (no mod_rewrite or .htaccess needed).
    res = await fetch(`${BASE}/index.php?r=${path}`, init);
  } catch {
    throw new ApiError("Can't reach the server. Check that WAMP (Apache and MySQL) is running.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON: usually a PHP error page or a wrong URL.
  }
  if (!res.ok) {
    throw new ApiError(
      data?.error || (res.status === 404 ? "The API was not found. Check that the backend is in the site's api folder (api/index.php)." : "Something went wrong. Please try again."),
      res.status,
    );
  }
  if (data === null) throw new ApiError("The server sent an unexpected response.", res.status);
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body = {}) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  patch: (path, body) => request("PATCH", path, body),
  del: (path) => request("DELETE", path),
  upload: (path, formData) => request("POST", path, formData),
};
