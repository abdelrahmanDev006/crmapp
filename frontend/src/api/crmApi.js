import http from "./http";

export const authApi = {
  login: (payload) => http.post("/auth/login", payload),
  logout: () => http.post("/auth/logout"),
  me: () => http.get("/auth/me")
};

export const dashboardApi = {
  getSummary: () => http.get("/dashboard/summary")
};

export const regionsApi = {
  list: () => http.get("/regions"),
  getById: (id) => http.get(`/regions/${id}`),
  create: (payload) => http.post("/regions", payload),
  update: (id, payload) => http.patch(`/regions/${id}`, payload),
  remove: (id) => http.delete(`/regions/${id}`),
  handleAll: (id, payload = {}) => http.post(`/regions/${id}/handle-all`, payload)
};

export const clientsApi = {
  list: (params) => http.get("/clients", { params }),
  getById: (id) => http.get(`/clients/${id}`),
  create: (payload) => http.post("/clients", payload),
  update: (id, payload) => http.patch(`/clients/${id}`, payload),
  handle: (id, payload) => http.post(`/clients/${id}/handle`, payload),
  remove: (id) => http.delete(`/clients/${id}`)
};

export const usersApi = {
  list: (params) => http.get("/users", { params }),
  create: (payload) => http.post("/users", payload),
  update: (id, payload) => http.patch(`/users/${id}`, payload),
  remove: (id) => http.delete(`/users/${id}`)
};
