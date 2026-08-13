import React, { useState, useEffect } from 'react';
import { Pencil, Upload, Calendar, Building, Phone, Mail, MapPin, CheckCircle2 } from 'lucide-react';
import { BusinessDetails } from '../../types';
import { fetchServerCompanyProfile, saveServerCompanyProfile } from '../../services/api';
import { db } from '../../db';

interface EditProfileScreenProps {
  business: BusinessDetails;
  onUpdateBusiness: (updated: Partial<BusinessDetails>) => void;
  onCancel: () => void;
}

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({
  business,
  onUpdateBusiness,
  onCancel
}) => {
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    if (!name) {
      alert('Business Name is required');
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

    if (savedLogo) setLogoUrl(savedLogo);
    if (savedSig) setSignatureUrl(savedSig);

    const fullPayload = {
      ...profilePayload,
      logoUrl: savedLogo,
      signatureUrl: savedSig
    };

    // 2. Save to Browser localStorage
    localStorage.setItem('vyapar_business_details', JSON.stringify(fullPayload));

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
      logoUrl: savedLogo,
      signatureUrl: savedSig
    });

    setIsSaving(false);
    setSaveSuccess(true);
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
