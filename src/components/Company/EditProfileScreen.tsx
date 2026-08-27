import React, { useState, useEffect } from 'react';
import { Pencil, Upload, Calendar, Building, Phone, Mail, MapPin, CheckCircle2, Trash2, Lock, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { BusinessDetails } from '../../types';
import { fetchServerCompanyProfile, saveServerCompanyProfile, changeUserPassword } from '../../services/api';
import { db } from '../../db';
import { useToast } from '../Common/ToastContext';

interface EditProfileScreenProps {
  business: BusinessDetails;
  onUpdateBusiness: (updated: Partial<BusinessDetails>) => void;
  onCancel: () => void;
  onDeleteCompany?: (tenantId: string, companyName: string) => void;
}

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({
  business,
  onUpdateBusiness,
  onCancel,
  onDeleteCompany
}) => {
  const { showToast } = useToast();
  const activeTenantId = business.tenantId || 'default-tenant';

  const [name, setName] = useState(business.name || 'My Company');
  const [phone, setPhone] = useState(business.phone || '+92 300 xxxxxxx');
  const [email, setEmail] = useState(business.email || 'contact@supermarket.com');
  const [address, setAddress] = useState(business.address || '');
  const [gstin, setGstin] = useState(business.gstin || 'NTN: 7654321-0');
  const [businessType, setBusinessType] = useState(business.businessType || 'Retail');
  const [businessCategory, setBusinessCategory] = useState(business.businessCategory || 'Supermarket & FMCG');
  const [pincode, setPincode] = useState(business.pincode || '54000');
  const [booksBeginDate, setBooksBeginDate] = useState('2026-08-10');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [primaryWarehouseId, setPrimaryWarehouseId] = useState<number | ''>('');
  const [warehouses, setWarehouses] = useState<{ id?: number; name: string; code: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    db.locations.where('type').equals('WAREHOUSE').toArray().then(locs => {
      setWarehouses(locs);
    });
  }, []);

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passMessage, setPassMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMessage(null);

    if (!currentPassword || !newPassword) {
      setPassMessage({ text: 'Please fill in both current and new password fields.', type: 'error' });
      return;
    }

    if (newPassword.length < 8) {
      setPassMessage({ text: 'New password must be at least 8 characters long.', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassMessage({ text: 'New password and confirm password do not match.', type: 'error' });
      return;
    }

    setIsChangingPass(true);
    try {
      const res = await changeUserPassword(currentPassword, newPassword);
      if (!res.success) throw new Error(res.error || 'Failed to change password.');
      setPassMessage({ text: 'Password updated successfully!', type: 'success' });
      showToast('Password changed successfully.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPassMessage({ text: err.message || 'Unable to change password.', type: 'error' });
    } finally {
      setIsChangingPass(false);
    }
  };

  // Load profile from PostgreSQL API or Dexie local IndexedDB fallback
  useEffect(() => {
    setName(business.name || 'My Company');
    setPhone(business.phone || '+92 300 xxxxxxx');
    setEmail(business.email || 'contact@supermarket.com');
    setAddress(business.address || '');
    setGstin(business.gstin || 'NTN: 7654321-0');
    setBusinessType(business.businessType || 'Retail');
    setBusinessCategory(business.businessCategory || 'Supermarket & FMCG');
    setPincode(business.pincode || '54000');

    async function loadCompanyProfile() {
      const serverProfile = await fetchServerCompanyProfile(activeTenantId);
      const profile = serverProfile || (await db.companyProfiles.where('tenantId').equals(activeTenantId).first());
      if (profile) {
        if (profile.name) setName(profile.name);
        if (profile.phone) setPhone(profile.phone);
        if (profile.email) setEmail(profile.email);
        if (profile.address) setAddress(profile.address);
        if (profile.gstin) setGstin(profile.gstin);
        if (profile.businessType) setBusinessType(profile.businessType);
        if (profile.businessCategory) setBusinessCategory(profile.businessCategory);
        if (profile.pincode) setPincode(profile.pincode);
        if (profile.logoUrl) setLogoUrl(profile.logoUrl);
        if (profile.signatureUrl) setSignatureUrl(profile.signatureUrl);
        if (profile.booksBeginDate) setBooksBeginDate(profile.booksBeginDate);
        if (profile.primaryWarehouseId) setPrimaryWarehouseId(profile.primaryWarehouseId);
      }
    }
    loadCompanyProfile();
  }, [activeTenantId, business]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignatureUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Business Name is required', 'warning');
      return;
    }

    setIsSaving(true);

    const profilePayload = {
      tenantId: activeTenantId,
      name,
      phone,
      email,
      address,
      gstin,
      businessType,
      businessCategory,
      pincode,
      logoUrl: logoUrl || '',
      signatureUrl: signatureUrl || '',
      booksBeginDate
    };

    // 1. Save to PostgreSQL database
    const res = await saveServerCompanyProfile(profilePayload);
    const savedLogo = res?.data?.logoUrl || profilePayload.logoUrl;
    const savedSig = res?.data?.signatureUrl || profilePayload.signatureUrl;

    // Preserve Base64 string locally so logo works 100% OFFLINE without server
    const offlineLogo = logoUrl && logoUrl.startsWith('data:image/') ? logoUrl : (localStorage.getItem('vyapar_offline_logo') || savedLogo);
    const offlineSig = signatureUrl && signatureUrl.startsWith('data:image/') ? signatureUrl : (localStorage.getItem('vyapar_offline_sig') || savedSig);

    if (offlineLogo && offlineLogo.startsWith('data:image/')) {
      localStorage.setItem('vyapar_offline_logo', offlineLogo);
    }
    if (offlineSig && offlineSig.startsWith('data:image/')) {
      localStorage.setItem('vyapar_offline_sig', offlineSig);
    }

    const fullPayload = {
      ...profilePayload,
      logoUrl: offlineLogo || savedLogo,
      signatureUrl: offlineSig || savedSig
    };

    // 2. Save to Browser localStorage
    localStorage.setItem('vyapar_business_details', JSON.stringify(fullPayload));

    // Also update Dexie companyProfiles table locally
    const existingComp = await db.companyProfiles.where('tenantId').equals(activeTenantId).first();
    if (existingComp && existingComp.id) {
      await db.companyProfiles.update(existingComp.id, {
        name,
        phone,
        email,
        address,
        gstin,
        businessType,
        businessCategory,
        pincode,
        logoUrl: offlineLogo || savedLogo,
        signatureUrl: offlineSig || savedSig,
        booksBeginDate,
        primaryWarehouseId: primaryWarehouseId ? Number(primaryWarehouseId) : undefined,
        updatedAt: new Date().toISOString()
      });
    } else {
      await db.companyProfiles.add({
        tenantId: activeTenantId,
        name,
        phone,
        email,
        address,
        gstin,
        businessType,
        businessCategory,
        pincode,
        logoUrl: offlineLogo || savedLogo,
        signatureUrl: offlineSig || savedSig,
        booksBeginDate,
        updatedAt: new Date().toISOString()
      } as any);
    }

    // 3. Update parent React state
    onUpdateBusiness({
      tenantId: activeTenantId,
      name,
      phone,
      email,
      address,
      gstin,
      businessType,
      businessCategory,
      pincode,
      logoUrl: offlineLogo || savedLogo,
      signatureUrl: offlineSig || savedSig
    });

    setIsSaving(false);
    setSaveSuccess(true);
    showToast('Company profile & branding updated successfully!', 'success');
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const displayLogoUrl = logoUrl ? (logoUrl.startsWith('/uploads/') ? `http://localhost:5000${logoUrl}` : logoUrl) : null;
  const displaySignatureUrl = signatureUrl ? (signatureUrl.startsWith('/uploads/') ? `http://localhost:5000${signatureUrl}` : signatureUrl) : null;

  return (
    <div className="flex-1 bg-[#f0f4f8] p-6 overflow-y-auto flex flex-col justify-between select-none">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Title Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h1 className="text-xl font-bold text-slate-800">Edit Profile</h1>
          {saveSuccess && (
            <div className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Saved to PostgreSQL Database!</span>
            </div>
          )}
        </div>

        {/* Top Logo Upload Circle */}
        <div className="flex items-center justify-start">
          <div className="relative">
            <div className="w-36 h-36 rounded-full border-4 border-sky-400 bg-sky-50 flex flex-col items-center justify-center text-sky-600 font-semibold cursor-pointer overflow-hidden group shadow-sm hover:border-sky-500 transition">
              {displayLogoUrl ? (
                <img src={displayLogoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-2">
                  <span className="text-4xl font-extrabold text-sky-600 mb-0.5">
                    {name ? name.charAt(0).toUpperCase() : 'C'}
                  </span>
                  <span className="text-[10px] font-bold text-sky-500 uppercase tracking-wider">Add Logo</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
            <label className="absolute bottom-1 right-1 bg-white p-2 rounded-full border border-slate-300 shadow-md text-slate-600 hover:text-sky-600 cursor-pointer">
              <Pencil className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* 3-Column Profile Form matching reference image */}
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1: Business Details */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 tracking-wide">Business Details</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Business Name<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Company"
                className="w-full px-3 py-2 bg-white border border-sky-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="03001234567"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email ID</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter Email ID"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Account Books Beginning Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={booksBeginDate}
                  onChange={e => setBooksBeginDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
            </div>
          </div>

          {/* Column 2: More Details */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 tracking-wide">More Details</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Business Type</label>
              <select
                value={businessType}
                onChange={e => setBusinessType(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
              >
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Distributor">Distributor</option>
                <option value="Service">Service</option>
                <option value="Manufacturing">Manufacturing</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Business Category</label>
              <select
                value={businessCategory}
                onChange={e => setBusinessCategory(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
              >
                <option value="Supermarket & FMCG">Supermarket & FMCG</option>
                <option value="Grocery & General Store">Grocery & General Store</option>
                <option value="Electronics & Mobiles">Electronics & Mobiles</option>
                <option value="Apparel & Clothing">Apparel & Clothing</option>
                <option value="Pharmacy & Medical">Pharmacy & Medical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Primary Supply Warehouse Hub</label>
              <select
                value={primaryWarehouseId}
                onChange={e => setPrimaryWarehouseId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 bg-purple-50/70 border border-purple-300 rounded-lg text-sm font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
              >
                <option value="">-- No Linked Warehouse Hub --</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pincode / Postal Code</label>
              <input
                type="text"
                value={pincode}
                onChange={e => setPincode(e.target.value)}
                placeholder="Enter Pincode"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">NTN / GSTIN Number</label>
              <input
                type="text"
                value={gstin}
                onChange={e => setGstin(e.target.value)}
                placeholder="NTN: 7654321-0"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
          </div>

          {/* Column 3: Business Address & Signature */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 tracking-wide">Business Address</h2>

            <div>
              <textarea
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Enter Business Address"
                rows={4}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Add Signature</label>
              <div className="w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-white flex flex-col items-center justify-center text-slate-400 cursor-pointer relative hover:border-sky-400 transition overflow-hidden">
                {displaySignatureUrl ? (
                  <img src={displaySignatureUrl} alt="Signature" className="h-full object-contain p-2" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-extrabold text-sm mb-1 border border-slate-200 shadow-xs">
                      {name ? name.charAt(0).toUpperCase() : 'S'}
                    </div>
                    <span className="text-xs font-semibold text-slate-500">Upload Signature</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSignatureUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Security & Account Password */}
      <div className="max-w-6xl mx-auto w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mt-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Security & Account Password</h3>
            <p className="text-xs text-slate-500 font-medium">Update your account credentials</p>
          </div>
        </div>

        {passMessage && (
          <div className={`p-3 rounded-xl text-xs font-medium mb-4 flex items-center gap-2 ${
            passMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            <span>{passMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Current Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 pl-9 pr-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-600 transition"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">New Password (min 8 chars)</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 pl-9 pr-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-600 transition"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Confirm New Password</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-600 transition"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
              <button
                type="submit"
                disabled={isChangingPass}
                className="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isChangingPass ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Danger Zone: Delete Store */}
      {onDeleteCompany && (
        <div className="max-w-6xl mx-auto w-full bg-red-50/70 border border-red-200/80 rounded-2xl p-5 mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="font-extrabold text-red-900 text-sm flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Delete Store Profile</span>
            </h3>
            <p className="text-xs text-red-700/80 mt-1 max-w-2xl font-medium leading-relaxed">
              Permanently delete this company profile ({business.name}) and all associated catalog items, customer ledgers, invoices, and returns from both local offline storage and cloud PostgreSQL database.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDeleteCompany(business.tenantId || 'default-tenant', business.name || 'Store')}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Store</span>
          </button>
        </div>
      )}

      {/* Bottom Action Footer */}
      <div className="max-w-6xl mx-auto w-full flex items-center justify-end gap-3 pt-6 border-t border-slate-200 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 rounded-full border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-md transition cursor-pointer disabled:opacity-50"
        >
          {isSaving ? 'Saving to Database...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};
