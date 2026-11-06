const BASE_URL = '/api';

let activeToken = localStorage.getItem('tally_fish_token') || null;
let activeBranchId = localStorage.getItem('tally_fish_branch_id') || null;

export function setApiAuth(token) {
  activeToken = token;
  if (token) {
    localStorage.setItem('tally_fish_token', token);
  } else {
    localStorage.removeItem('tally_fish_token');
  }
}

export function setApiBranch(branchId) {
  activeBranchId = branchId;
  if (branchId) {
    localStorage.setItem('tally_fish_branch_id', branchId);
  } else {
    localStorage.removeItem('tally_fish_branch_id');
  }
}

export async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }

  if (activeBranchId) {
    headers['X-Branch-ID'] = activeBranchId;
  }

  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  let data = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = (data && data.error) || (data && data.message) || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};

