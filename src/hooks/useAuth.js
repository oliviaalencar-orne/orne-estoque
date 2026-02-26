/**
 * useAuth.js — Authentication state, profile fetch, and permission flags
 *
 * Extracted from index-legacy.html App component L2332-2448
 */
import { useState, useEffect } from 'react';
import { supabaseClient } from '@/config/supabase';

/**
 * Hook that manages:
 * - Supabase auth session (user)
 * - User profile from user_profiles table (with retry logic)
 * - Permission flags (isStockAdmin, isSuperAdmin)
 * - Loading states
 *
 * @returns {Object} { user, userProfile, isStockAdmin, isSuperAdmin, loading, profileLoading, handleLogout }
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Permission flags
  const isStockAdmin =
    userProfile?.status === 'approved' &&
    ['oliviaalencar@hotmail.com', 'sac@ornestudio.com'].includes(userProfile?.email);
  const isSuperAdmin =
    userProfile?.status === 'approved' &&
    userProfile?.email === 'oliviaalencar@hotmail.com';

  // Auth session management
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      // Only update reference if user ACTUALLY changed (login/logout/switch)
      // TOKEN_REFRESHED with same user.id keeps reference → avoids cascade
      setUser((prev) => {
        if (!prev && !newUser) return prev;
        if (!prev || !newUser) return newUser;
        if (prev.id === newUser.id) return prev;
        return newUser;
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  // Profile fetch with retries
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);

    const fetchProfile = async (retries = 3) => {
      try {
        const { data, error: err } = await supabaseClient
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (data && !err) {
          setUserProfile(data);
          setProfileLoading(false);
          return;
        }

        // Profile not found yet — retry (trigger may not have fired)
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 1500));
          return fetchProfile(retries - 1);
        }

        // After all retries, set as pending (genuinely new user)
        setUserProfile({ status: 'pending', role: 'user' });
        setProfileLoading(false);
      } catch (e) {
        console.error('Error fetching profile:', e);
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 1500));
          return fetchProfile(retries - 1);
        }
        setUserProfile({ status: 'pending', role: 'user' });
        setProfileLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleLogout = () => supabaseClient.auth.signOut();

  return {
    user,
    userProfile,
    isStockAdmin,
    isSuperAdmin,
    loading,
    profileLoading,
    handleLogout,
  };
}
