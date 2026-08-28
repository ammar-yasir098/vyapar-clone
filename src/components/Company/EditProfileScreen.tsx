import React, { useState, useEffect } from 'react';
import { Pencil, Upload, Calendar, Building, Phone, Mail, MapPin, CheckCircle2, Trash2, Lock, Eye, EyeOff, KeyRound, ShieldCheck, ArrowLeft, ChevronRight, Store, ShieldAlert, Sparkles } from 'lucide-react';
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

export type SettingsSubView = 'hub' | 'edit-profile' | 'update-password' | 'delete-store';

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({
  business,
  onUpdateBusiness,
  onCancel,
  onDeleteCompany
}) => {
  const { showToast } = useToast();
  const activeTenantId = business.tenantId || 'default-tenant';

  // Sub-page navigation state
  const [subView, setSubView] = useState<SettingsSubView>('hub');

  // Business form state
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

    const res = await saveServerCompanyProfile(profilePayload);
    const savedLogo = res?.data?.logoUrl || profilePayload.logoUrl;
    const savedSig = res?.data?.signatureUrl || profilePayload.signatureUrl;

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

    localStorage.setItem('vyapar_business_details', JSON.stringify(fullPayload));

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
    <div className="flex-1 bg-[#f8fafc] p-4 sm:p-6 overflow-y-auto flex flex-col justify-between select-none">
      <div className="max-w-6xl mx-auto w-full space-y-6">

        {/* Settings Header Breadcrumb */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold mb-1">
                <span>Store Settings</span>
                {subView !== 'hub' && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-indigo-600 font-bold capitalize">{subView.replace('-', ' ')}</span>
                  </>
                )}
              </div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                {subView === 'hub' && 'Store & Account Settings Hub'}
                {subView === 'edit-profile' && 'Edit Store Profile'}
                {subView === 'update-password' && 'Security & Account Password'}
                {subView === 'delete-store' && 'Delete Store Profile'}
              </h1>
            </div>
          </div>
        </div>

        {/* ── VIEW 1: SETTINGS HUB OVERVIEW ───────────────────────────────── */}
        {subView === 'hub' && (
          <div className="space-y-6 animate-fade-in">
            {/* Store Profile Card Header */}
            <div className="card card-glass p-6 flex flex-col md:flex-row items-center justify-between gap-6 border-indigo-100">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0 overflow-hidden">
                  {displayLogoUrl ? (
                    <img src={displayLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <span>{name ? name.charAt(0).toUpperCase() : 'S'}</span>
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">{name}</h2>
                  <div className="text-xs text-slate-500 font-semibold flex items-center gap-2 mt-0.5">
                    <span>{gstin || 'NTN: 7654321-0'}</span>
                    <span>•</span>
                    <span className="font-mono text-indigo-600 font-bold">{phone}</span>
                    <span>•</span>
                    <span className="text-slate-400 font-mono">{activeTenantId}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Main Interactive Option Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Card 1: Edit Store Profile */}
              <div
                onClick={() => setSubView('edit-profile')}
                className="card card-glass card-clickable p-6 flex flex-col justify-between space-y-5 border-t-4 border-indigo-500 group"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/80 text-indigo-600 flex items-center justify-center font-black transition-transform group-hover:scale-110 shadow-2xs">
                    <Building className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">Edit Store Profile</h3>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                      Manage business name, NTN/GSTIN, phone, email, address, logo, signature, and primary supply warehouse.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center text-xs font-bold text-indigo-600 group-hover:text-indigo-700">
                  <span>Open Profile Editor</span>
                  <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                </div>
              </div>

              {/* Card 2: Security & Password */}
              <div
                onClick={() => setSubView('update-password')}
                className="card card-glass card-clickable p-6 flex flex-col justify-between space-y-5 border-t-4 border-slate-700 group"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center font-black transition-transform group-hover:scale-110 shadow-2xs">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 group-hover:text-slate-700 transition-colors">Update Account Password</h3>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                      Update your account security credentials, change account password, and manage protection settings.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center text-xs font-bold text-slate-800 group-hover:text-slate-900">
                  <span>Update Password</span>
                  <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                </div>
              </div>

              {/* Card 3: Delete Store Profile */}
              {onDeleteCompany && (
                <div
                  onClick={() => setSubView('delete-store')}
                  className="card card-glass card-clickable p-6 flex flex-col justify-between space-y-5 border-t-4 border-rose-500 group"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-black transition-transform group-hover:scale-110 shadow-2xs">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 group-hover:text-rose-600 transition-colors">Delete Store Profile</h3>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                        Permanently delete this company profile ({name}) and all associated catalog items, invoices, and ledgers.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center text-xs font-bold text-rose-600 group-hover:text-rose-700">
                    <span>Manage Danger Zone</span>
                    <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── VIEW 2: EDIT STORE PROFILE SUB-PAGE ─────────────────────────── */}
        {subView === 'edit-profile' && (
          <div className="space-y-6 animate-slide-up">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSubView('hub')}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Settings Hub</span>
              </button>

              {saveSuccess && (
                <div className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Saved to Database!</span>
                </div>
              )}
            </div>

            {/* Top Logo Upload Circle */}
            <div className="card card-glass p-6 flex items-center justify-start gap-6">
              <div className="relative">
                <div className="w-32 h-32 rounded-full border-4 border-indigo-400 bg-indigo-50 flex flex-col items-center justify-center text-indigo-600 font-semibold cursor-pointer overflow-hidden group shadow-md hover:border-indigo-500 transition">
                  {displayLogoUrl ? (
                    <img src={displayLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-2">
                      <span className="text-4xl font-black text-indigo-600 mb-0.5">
                        {name ? name.charAt(0).toUpperCase() : 'C'}
                      </span>
                      <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Add Logo</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                <label className="absolute bottom-1 right-1 bg-white p-2 rounded-full border border-slate-300 shadow-md text-slate-600 hover:text-indigo-600 cursor-pointer">
                  <Pencil className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Store Logo & Branding</h3>
                <p className="text-xs text-slate-500 font-medium max-w-md mt-0.5">
                  Upload your business logo to personalize invoices, thermal receipts, and estimate bills. Supports PNG, JPG, or SVG images.
                </p>
              </div>
            </div>

            {/* 3-Column Profile Form */}
            <form onSubmit={handleSave} className="card card-glass p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Column 1: Business Details */}
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 tracking-wide border-b border-slate-200/80 pb-2">Business Details</h2>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Business Name<span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="My Company"
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="03001234567"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email ID</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter Email ID"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Account Books Beginning Date</label>
                  <input
                    type="date"
                    value={booksBeginDate}
                    onChange={e => setBooksBeginDate(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              {/* Column 2: More Details */}
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 tracking-wide border-b border-slate-200/80 pb-2">More Details</h2>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Business Type</label>
                  <select
                    value={businessType}
                    onChange={e => setBusinessType(e.target.value)}
                    className="input-field cursor-pointer"
                  >
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                    <option value="Distributor">Distributor</option>
                    <option value="Service">Service</option>
                    <option value="Manufacturing">Manufacturing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Business Category</label>
                  <select
                    value={businessCategory}
                    onChange={e => setBusinessCategory(e.target.value)}
                    className="input-field cursor-pointer"
                  >
                    <option value="Supermarket & FMCG">Supermarket & FMCG</option>
                    <option value="Grocery & General Store">Grocery & General Store</option>
                    <option value="Electronics & Mobiles">Electronics & Mobiles</option>
                    <option value="Apparel & Clothing">Apparel & Clothing</option>
                    <option value="Pharmacy & Medical">Pharmacy & Medical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Primary Supply Warehouse Hub</label>
                  <select
                    value={primaryWarehouseId}
                    onChange={e => setPrimaryWarehouseId(e.target.value ? Number(e.target.value) : '')}
                    className="input-field bg-indigo-50/70 border-indigo-300 text-indigo-900 font-bold cursor-pointer"
                  >
                    <option value="">-- No Linked Warehouse Hub --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pincode / Postal Code</label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={e => setPincode(e.target.value)}
                    placeholder="Enter Pincode"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">NTN / GSTIN Number</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    placeholder="NTN: 7654321-0"
                    className="input-field"
                  />
                </div>
              </div>

              {/* Column 3: Business Address & Signature */}
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 tracking-wide border-b border-slate-200/80 pb-2">Business Address & Signature</h2>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Business Address</label>
                  <textarea
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Enter Business Address"
                    rows={4}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Add Signature</label>
                  <div className="w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-white flex flex-col items-center justify-center text-slate-400 cursor-pointer relative hover:border-indigo-400 transition overflow-hidden">
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

            {/* Bottom Action Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSubView('hub')}
                className="btn-vyapar-outline text-xs font-bold px-5 py-2 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="btn-vyapar-blue text-xs font-bold px-6 py-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW 3: SECURITY & PASSWORD SUB-PAGE ────────────────────────── */}
        {subView === 'update-password' && (
          <div className="space-y-6 animate-slide-up">
            <button
              onClick={() => setSubView('hub')}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Settings Hub</span>
            </button>

            <div className="card card-glass p-6 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-200/80">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Security & Account Password</h3>
                  <p className="text-xs text-slate-500 font-medium">Update your user login password and access credentials</p>
                </div>
              </div>

              {passMessage && (
                <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  passMessage.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  <span>{passMessage.text}</span>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-5 max-w-xl">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Current Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input-field pl-9 pr-9"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
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
                      className="input-field pl-9 pr-9"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input-field pl-9"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isChangingPass}
                    className="btn-vyapar-blue text-xs font-bold px-6 py-2.5 cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {isChangingPass ? 'Updating Password...' : 'Update Password'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubView('hub')}
                    className="btn-vyapar-outline text-xs font-bold px-5 py-2.5 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── VIEW 4: DELETE STORE PROFILE SUB-PAGE (DANGER ZONE) ───────────── */}
        {subView === 'delete-store' && onDeleteCompany && (
          <div className="space-y-6 animate-slide-up">
            <button
              onClick={() => setSubView('hub')}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Settings Hub</span>
            </button>

            <div className="card bg-rose-50/80 border-2 border-rose-200 p-6 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-rose-200">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-rose-950 text-base">Delete Store Profile (Danger Zone)</h3>
                  <p className="text-xs text-rose-700 font-semibold">Permanently wipe store branch record and data</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-rose-900 font-medium leading-relaxed max-w-2xl">
                <p>
                  You are about to delete store branch profile <strong className="font-black text-rose-950">{name}</strong> ({activeTenantId}).
                </p>
                <p>
                  This action will permanently delete all associated store items, customer ledgers, sales invoices, purchase bills, and stock entries from both your local offline storage and PostgreSQL cloud database.
                </p>
              </div>

              <div className="pt-4 flex items-center gap-3 border-t border-rose-200">
                <button
                  type="button"
                  onClick={() => onDeleteCompany(activeTenantId, name)}
                  className="btn-vyapar-red text-xs font-extrabold px-6 py-2.5 cursor-pointer shadow-md"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Confirm & Permanently Delete Store</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubView('hub')}
                  className="btn-vyapar-outline text-xs font-bold px-5 py-2.5 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
