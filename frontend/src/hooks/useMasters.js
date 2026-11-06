import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { persistMasters, getCachedMasters } from '../services/db';

/**
 * Hook to fetch and cache Parties / Vendors
 * Automatically falls back to IndexedDB for offline quick-picking
 */
export function useParties(branchId) {
  return useQuery({
    queryKey: ['masters', 'parties', branchId],
    queryFn: async () => {
      try {
        const res = await api.get('/masters/parties');
        const list = res.data || [];
        // Persist fresh data to IndexedDB
        await persistMasters('parties', branchId, list);
        return list;
      } catch (err) {
        console.warn('[useParties] Network fetch failed, reading from IndexedDB:', err.message);
        const cached = await getCachedMasters('parties', branchId);
        if (cached && cached.length > 0) return cached;
        throw err;
      }
    },
    enabled: !!branchId,
    staleTime: 10 * 60 * 1000, // 10 minutes cache freshness
    retry: 1,
  });
}

/**
 * Hook to fetch and cache Vehicles
 * Automatically falls back to IndexedDB for offline quick-picking
 */
export function useVehicles(branchId) {
  return useQuery({
    queryKey: ['masters', 'vehicles', branchId],
    queryFn: async () => {
      try {
        const res = await api.get('/masters/vehicles');
        const list = res.data || [];
        await persistMasters('vehicles', branchId, list);
        return list;
      } catch (err) {
        console.warn('[useVehicles] Network fetch failed, reading from IndexedDB:', err.message);
        const cached = await getCachedMasters('vehicles', branchId);
        if (cached && cached.length > 0) return cached;
        throw err;
      }
    },
    enabled: !!branchId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Hook to fetch and cache Fish Species / Types
 * Automatically falls back to IndexedDB for offline quick-picking
 */
export function useFishTypes(branchId) {
  return useQuery({
    queryKey: ['masters', 'fish_types', branchId],
    queryFn: async () => {
      try {
        const res = await api.get('/masters/fish-types');
        const list = res.data || [];
        await persistMasters('fish_types', branchId, list);
        return list;
      } catch (err) {
        console.warn('[useFishTypes] Network fetch failed, reading from IndexedDB:', err.message);
        const cached = await getCachedMasters('fish_types', branchId);
        if (cached && cached.length > 0) return cached;
        throw err;
      }
    },
    enabled: !!branchId,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Quick-create party on the fly (used by Staff at weighbridge)
 */
export function useCreateQuickParty(branchId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, phone }) => {
      if (navigator.onLine) {
        const res = await api.post('/masters/parties', { name, phone });
        return res.data;
      }
      // Offline fallback: cache locally
      const localParty = {
        id: `offline_party_${Date.now()}`,
        branch_id: branchId,
        name: name.trim(),
        phone: phone || null,
        is_active: true,
      };
      const existing = (await getCachedMasters('parties', branchId)) || [];
      await persistMasters('parties', branchId, [localParty, ...existing]);
      return localParty;
    },
    onSuccess: (newParty) => {
      queryClient.setQueryData(['masters', 'parties', branchId], (old = []) => {
        return [newParty, ...old];
      });
      queryClient.invalidateQueries({ queryKey: ['masters', 'parties', branchId] });
    },
  });
}

/**
 * Quick-create vehicle on the fly (used by Staff at weighbridge)
 */
export function useCreateQuickVehicle(branchId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ vehicle_no, party_id }) => {
      if (navigator.onLine) {
        const res = await api.post('/masters/vehicles', { vehicle_no, party_id });
        return res.data;
      }
      // Offline fallback: cache locally
      const localVehicle = {
        id: `offline_vehicle_${Date.now()}`,
        branch_id: branchId,
        vehicle_no: vehicle_no.trim().toUpperCase(),
        party_id: party_id || null,
        is_active: true,
      };
      const existing = (await getCachedMasters('vehicles', branchId)) || [];
      await persistMasters('vehicles', branchId, [localVehicle, ...existing]);
      return localVehicle;
    },
    onSuccess: (newVehicle) => {
      queryClient.setQueryData(['masters', 'vehicles', branchId], (old = []) => {
        return [newVehicle, ...old];
      });
      queryClient.invalidateQueries({ queryKey: ['masters', 'vehicles', branchId] });
    },
  });
}

/**
 * Quick-create fish type on the fly (used by Staff at weighbridge)
 */
export function useCreateQuickFishType(branchId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, default_rate }) => {
      if (navigator.onLine) {
        const res = await api.post('/masters/fish-types', { name, default_rate });
        return res.data;
      }
      // Offline fallback: cache locally
      const localFish = {
        id: `offline_fish_${Date.now()}`,
        branch_id: branchId,
        name: name.trim().toUpperCase(),
        default_rate: default_rate || 0,
        is_active: true,
      };
      const existing = (await getCachedMasters('fish_types', branchId)) || [];
      await persistMasters('fish_types', branchId, [localFish, ...existing]);
      return localFish;
    },
    onSuccess: (newFishType) => {
      queryClient.setQueryData(['masters', 'fish_types', branchId], (old = []) => {
        return [newFishType, ...old];
      });
      queryClient.invalidateQueries({ queryKey: ['masters', 'fish_types', branchId] });
    },
  });
}

