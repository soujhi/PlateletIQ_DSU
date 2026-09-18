import { apiClient } from "./client";

const BANK_ID = "TN-GGH-001";

export const authApi = {
  getMe: async () => {
    const res = await apiClient.get("/auth/me");
    return res.data.data;
  },
  googleStart: async () => {
    const res = await apiClient.get("/auth/google/start");
    return res.data.data;
  },
  googleCallback: async () => {
    const res = await apiClient.get("/auth/google/callback");
    return res.data.data;
  },
  logout: async () => {
    const res = await apiClient.post("/auth/logout");
    return res.data.data;
  },
};

export const inventoryApi = {
  getSummary: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/inventory/summary`);
    return res.data.data;
  },
  getUnits: async (params?: any) => {
    const res = await apiClient.get(`/banks/${BANK_ID}/inventory/units`, { params });
    return res.data.data;
  },
  registerUnit: async (payload: any) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/inventory/units`, payload);
    return res.data.data;
  },
  issueUnit: async (unitId: string, payload?: any) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/inventory/units/${unitId}/issue`, payload);
    return res.data.data;
  },
  disposeUnit: async (unitId: string, payload?: any) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/inventory/units/${unitId}/dispose`, payload);
    return res.data.data;
  },
};

export const forecastApi = {
  getLatest: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/forecast/latest`);
    return res.data.data;
  },
  triggerRun: async () => {
    const res = await apiClient.post(`/banks/${BANK_ID}/forecast/runs`);
    return res.data.data;
  },
  uploadHistory: async (formData: FormData) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/forecast/upload-history`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data;
  },
};

export const recommendationApi = {
  getCurrent: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/recommendation/current`);
    return res.data.data;
  },
  confirm: async (id: string) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/recommendations/${id}/confirm`);
    return res.data.data;
  },
  adjust: async (id: string, payload: { quantity: number; reason: string }) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/recommendations/${id}/adjust`, payload);
    return res.data.data;
  },
};

export const requisitionApi = {
  list: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/requisitions`);
    return res.data.data;
  },
  create: async (payload: any) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/requisitions`, payload);
    return res.data.data;
  },
  fulfill: async (id: string, payload?: any) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/requisitions/${id}/fulfill`, payload);
    return res.data.data;
  },
};

export const transferApi = {
  getOpportunities: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/transfers/opportunities`);
    return res.data.data;
  },
  makeOffer: async (oppId: string, payload: { quantity: number }) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/transfers/opportunities/${oppId}/offer`, payload);
    return res.data.data;
  },
  acceptOffer: async (offerId: string) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/transfers/offers/${offerId}/accept`);
    return res.data.data;
  },
  completeTransfer: async (offerId: string) => {
    const res = await apiClient.post(`/banks/${BANK_ID}/transfers/offers/${offerId}/complete`);
    return res.data.data;
  },
};

export const networkApi = {
  getNetwork: async () => {
    const res = await apiClient.get("/network");
    return res.data.data;
  },
  getRisks: async () => {
    const res = await apiClient.get("/network/risks");
    return res.data.data;
  },
};

export const analyticsApi = {
  getForecastAnalytics: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/analytics/forecast`);
    return res.data.data;
  },
  getWasteAnalytics: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/analytics/waste`);
    return res.data.data;
  },
  getModelHealth: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/analytics/model-health`);
    return res.data.data;
  },
};

export const campApi = {
  getSeasonal: async () => {
    const res = await apiClient.get(`/banks/${BANK_ID}/camps/seasonal`);
    return res.data.data;
  },
};
