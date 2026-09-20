import React, { useState, useEffect, useRef } from "react"
import { Settings, Eye, EyeOff, Save, Check, LogOut, ChevronDown, Cpu, Key, Languages } from "lucide-react"
import { DEFAULT_MODEL, GEMINI_MODEL_OPTIONS, isGeminiModel } from "../../shared/aiModels"

interface SettingsPanelProps {
    currentLanguage: string
    setLanguage: (language: string) => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    currentLanguage,
    setLanguage
}) => {
    const [apiKey, setApiKey] = useState("")
    const [showApiKey, setShowApiKey] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState("")
    const [saveSuccess, setSaveSuccess] = useState(false)

    const [isLanguageOpen, setIsLanguageOpen] = useState(false)
    const [isModelOpen, setIsModelOpen] = useState(false)
    const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL)

    const dropdownRef = useRef<HTMLDivElement>(null)
    const modelDropdownRef = useRef<HTMLDivElement>(null)

    const languages = [
        { id: "python", label: "Python" },
        { id: "javascript", label: "JavaScript" },
        { id: "java", label: "Java" },
        { id: "golang", label: "Go" },
        { id: "cpp", label: "C++" },
        { id: "swift", label: "Swift" },
        { id: "kotlin", label: "Kotlin" },
        { id: "ruby", label: "Ruby" },
        { id: "sql", label: "SQL" },
        { id: "r", label: "R" }
    ]

    useEffect(() => {
        // Load existing API key and Model
        const loadSettings = async () => {
            try {
                const keyResult = await window.electronAPI.getApiKey()
                if (keyResult.success && keyResult.apiKey) {
                    setApiKey(keyResult.apiKey)
                }

                // Load model preference
                const modelResult = await window.electronAPI.getModel()
                if (modelResult.success && isGeminiModel(modelResult.model)) {
                    setCurrentModel(modelResult.model)
                }
            } catch (error) {
                console.error("Failed to load settings:", error)
            }
        }
        loadSettings()

        // Click outside handler for dropdowns
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsLanguageOpen(false)
            }
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setIsModelOpen(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleLanguageSelect = (languageId: string) => {
        try {
            setLanguage(languageId)
            window.__LANGUAGE__ = languageId
            void window.electronAPI.setLanguage(languageId).then((result) => {
                if (!result.success) {
                    console.error("Failed to save language preference:", result.error)
                }
            })
            setIsLanguageOpen(false)
        } catch (error) {
            console.error("Error updating language preference:", error)
        }
    }

    const handleModelSelect = async (modelId: string) => {
        try {
            const result = await window.electronAPI.setModel(modelId)
            if (!result.success) throw new Error(result.error || "Could not save model")
            setCurrentModel(modelId)
            setSaveError("")
            setIsModelOpen(false)
        } catch (error) {
            setSaveError("Could not save the selected model. Please try again.")
        }
    }

    const handleSaveApiKey = async () => {
        setSaveError("")
        if (!apiKey.trim()) {
            setSaveError("Enter a Gemini API key before saving.")
            return
        }
        setIsSaving(true)
        try {
            const result = await window.electronAPI.setApiKey(apiKey.trim())
            if (result.success) {
                setSaveSuccess(true)
                setTimeout(() => setSaveSuccess(false), 2000)
                setIsEditing(false)
                setShowApiKey(false)
            } else {
                setSaveError(result.error || "Could not save API key.")
            }
        } catch (error) {
            setSaveError("Could not save API key. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="px-2 space-y-4 cursor-default">
            {/* Header */}
            <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                <Settings className="w-4 h-4 text-white/70" />
                <span className="text-sm font-medium text-white/90">Settings</span>
            </div>

            {/* Language Selector */}
            <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-white/50">
                    <Languages className="w-3.5 h-3.5" />
                    <span>Programming Language</span>
                </div>
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setIsLanguageOpen(!isLanguageOpen)}
                        className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-xs transition-all duration-200 cursor-interactive"
                    >
                        <span className="capitalize text-white/90">
                            {languages.find(l => l.id === currentLanguage)?.label || currentLanguage}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 ${isLanguageOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isLanguageOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50 py-1 max-h-48 overflow-y-auto custom-scrollbar">
                            {languages.map((lang) => (
                                <button
                                    key={lang.id}
                                    onClick={() => handleLanguageSelect(lang.id)}
                                    className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between cursor-interactive
                                        ${currentLanguage === lang.id
                                            ? "bg-white/10 text-white font-medium"
                                            : "text-white/70 hover:bg-white/5 hover:text-white"
                                        }`}
                                >
                                    {lang.label}
                                    {currentLanguage === lang.id && <Check className="w-3 h-3 text-emerald-400" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Model Selector */}
            <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-white/50">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>AI Model</span>
                </div>
                <div className="relative" ref={modelDropdownRef}>
                    <button
                        onClick={() => setIsModelOpen(!isModelOpen)}
                        className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-xs transition-all duration-200 cursor-interactive"
                    >
                        <span className="text-white/90 truncate">
                            {GEMINI_MODEL_OPTIONS.find(m => m.id === currentModel)?.label || currentModel}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 ${isModelOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isModelOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50 py-1 max-h-48 overflow-y-auto custom-scrollbar">
                            {GEMINI_MODEL_OPTIONS.map((model) => (
                                <button
                                    key={model.id}
                                    onClick={() => handleModelSelect(model.id)}
                                    className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between cursor-interactive
                                        ${currentModel === model.id
                                            ? "bg-white/10 text-white font-medium"
                                            : "text-white/70 hover:bg-white/5 hover:text-white"
                                        }`}
                                >
                                    {model.label}
                                    {currentModel === model.id && <Check className="w-3 h-3 text-emerald-400" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* API Key Section */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-white/50">
                    <div className="flex items-center gap-2">
                        <Key className="w-3.5 h-3.5" />
                        <span>API Key</span>
                    </div>
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className="text-[10px] hover:text-white transition-colors cursor-interactive"
                    >
                        {isEditing ? "Cancel" : "Edit"}
                    </button>
                </div>

                {isEditing ? (
                    <div className="space-y-2">
                        <div className="relative">
                            <input
                                aria-label="Gemini API key"
                                type={showApiKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter Gemini API Key"
                                className="w-full bg-white/5 rounded-lg px-3 py-2 text-xs outline-none border border-white/10 focus:border-white/30 pr-8 text-white placeholder-white/30 transition-colors"
                            />
                            <button
                                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 cursor-interactive"
                            >
                                {showApiKey ? (
                                    <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                )}
                            </button>
                        </div>
                        <button
                            onClick={handleSaveApiKey}
                            disabled={isSaving}
                            className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white/90 rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-50 cursor-interactive"
                        >
                            {isSaving ? (
                                "Saving..."
                            ) : saveSuccess ? (
                                <>
                                    <Check className="w-3.5 h-3.5" />
                                    Saved
                                </>
                            ) : (
                                <>
                                    <Save className="w-3.5 h-3.5" />
                                    Save Key
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white/50 italic truncate">
                        {apiKey ? "••••••••••••••••" : "No API key set"}
                    </div>
                )}
            </div>

            {saveError && <p role="alert" className="text-xs text-red-300">{saveError}</p>}
            {saveSuccess && <p role="status" className="text-xs text-emerald-300">API key saved.</p>}

            {/* Divider */}
            <div className="h-px bg-white/10 my-2" />

            {/* Quit App Button */}
            <button
                onClick={() => window.electronAPI.quitApp()}
                className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg py-2 text-xs font-medium transition-colors cursor-interactive"
            >
                <LogOut className="w-3.5 h-3.5" />
                Quit App
            </button>
        </div>
    )
}
