import { useState, useRef, useEffect } from "react";
import { Check, X, Plus, Loader2, AlertTriangle, ChevronUp, ChevronDown, Building2, GripVertical, Lightbulb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CompanyIntelligence {
  industry: string;
  businessType: string;
  targetAudience: string;
  valueProposition: string;
  marketPosition: string;
}

export interface ConfirmedContext extends CompanyIntelligence {
  selectedKeywords: string[];
  confirmedCompetitors: string[];
}

interface BusinessContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (context: ConfirmedContext) => void;
  websiteUrl: string;
  companyIntelligence: CompanyIntelligence;
  suggestedIndustries: string[];
  suggestedKeywords: string[];
  detectedCompetitors?: string[];
  isLoading?: boolean;
}

const AeoTip = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-muted-foreground mt-2">
    <Lightbulb className="h-4 w-4 text-blue-700 flex-shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);

const COMMON_INDUSTRIES = [
  "SaaS / Software",
  "E-commerce / Retail",
  "Digital Marketing Agency",
  "Healthcare / Medical",
  "Financial Services",
  "Education / EdTech",
  "Real Estate",
  "Legal Services",
  "Consulting",
  "Manufacturing",
  "Travel / Hospitality",
  "Food & Beverage",
  "Technology / IT Services",
  "Media / Entertainment",
  "Non-profit / NGO",
  "Automotive",
  "Construction",
  "Professional Services",
  "Telecommunications",
  "Energy / Utilities",
  "Insurance",
  "Logistics / Supply Chain",
  "HR / Recruitment",
  "Cybersecurity",
  "AI / Machine Learning",
  "FinTech",
  "PropTech",
  "HealthTech",
  "CleanTech",
  "MarTech",
  "AdTech",
  "Study Abroad Consulting",
  "Immigration Services",
  "Multicultural Marketing",
  "Ethnic Media",
  "Programmatic Advertising",
];

export default function BusinessContextModal({
  isOpen,
  onClose,
  onConfirm,
  websiteUrl,
  companyIntelligence,
  suggestedIndustries,
  suggestedKeywords,
  detectedCompetitors = [],
  isLoading = false,
}: BusinessContextModalProps) {
  const [editedContext, setEditedContext] = useState<CompanyIntelligence>(companyIntelligence);
  const [selectedIndustry, setSelectedIndustry] = useState<string>(companyIntelligence.industry);
  const [showCustomIndustry, setShowCustomIndustry] = useState(false);
  const [customIndustry, setCustomIndustry] = useState("");
  const [industryAutocomplete, setIndustryAutocomplete] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(suggestedKeywords);
  const [customKeyword, setCustomKeyword] = useState("");
  const [draggedKeyword, setDraggedKeyword] = useState<string | null>(null);

  const [competitors, setCompetitors] = useState<string[]>(detectedCompetitors);
  const [customCompetitor, setCustomCompetitor] = useState("");
  const [customIndustries, setCustomIndustries] = useState<string[]>([]);

  const allIndustries = [
    companyIntelligence.industry,
    ...suggestedIndustries.filter(i => i !== companyIntelligence.industry),
    ...customIndustries.filter(i => i !== companyIntelligence.industry && !suggestedIndustries.includes(i)),
  ];

  useEffect(() => {
    if (customIndustry.length >= 2) {
      const filtered = COMMON_INDUSTRIES.filter(ind => 
        ind.toLowerCase().includes(customIndustry.toLowerCase())
      ).slice(0, 6);
      setIndustryAutocomplete(filtered);
      setShowAutocomplete(filtered.length > 0);
    } else {
      setShowAutocomplete(false);
    }
  }, [customIndustry]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleIndustrySelect = (industry: string) => {
    setSelectedIndustry(industry);
    setEditedContext(prev => ({ ...prev, industry }));
    setShowCustomIndustry(false);
  };

  const handleAddCustomIndustry = (industry?: string) => {
    const value = industry || customIndustry.trim();
    if (value) {
      setSelectedIndustry(value);
      setEditedContext(prev => ({ ...prev, industry: value }));
      if (!suggestedIndustries.includes(value) && value !== companyIntelligence.industry) {
        setCustomIndustries(prev => prev.includes(value) ? prev : [...prev, value]);
      }
      setShowCustomIndustry(false);
      setCustomIndustry("");
      setShowAutocomplete(false);
    }
  };

  const toggleKeyword = (keyword: string) => {
    const isRemoving = selectedKeywords.includes(keyword);
    if (isRemoving && !suggestedKeywords.includes(keyword)) {
      setRemovedCustomKeywords(prev => prev.includes(keyword) ? prev : [...prev, keyword]);
    }
    if (!isRemoving) {
      setRemovedCustomKeywords(prev => prev.filter(k => k !== keyword));
    }
    setSelectedKeywords(prev =>
      isRemoving ? prev.filter(k => k !== keyword) : [...prev, keyword]
    );
  };

  const addCustomKeyword = () => {
    if (customKeyword.trim() && !selectedKeywords.includes(customKeyword.trim())) {
      setSelectedKeywords(prev => [...prev, customKeyword.trim()]);
      setCustomKeyword("");
    }
  };

  const handleDragStart = (keyword: string) => {
    setDraggedKeyword(keyword);
  };

  const handleDragOver = (e: React.DragEvent, targetKeyword: string) => {
    e.preventDefault();
    if (draggedKeyword && draggedKeyword !== targetKeyword) {
      const newOrder = [...selectedKeywords];
      const draggedIndex = newOrder.indexOf(draggedKeyword);
      const targetIndex = newOrder.indexOf(targetKeyword);
      if (draggedIndex !== -1 && targetIndex !== -1) {
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedKeyword);
        setSelectedKeywords(newOrder);
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedKeyword(null);
  };

  const moveKeywordUp = (keyword: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const index = selectedKeywords.indexOf(keyword);
    if (index > 0) {
      const newOrder = [...selectedKeywords];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      setSelectedKeywords(newOrder);
    }
  };

  const moveKeywordDown = (keyword: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const index = selectedKeywords.indexOf(keyword);
    if (index < selectedKeywords.length - 1) {
      const newOrder = [...selectedKeywords];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      setSelectedKeywords(newOrder);
    }
  };

  const addCompetitor = () => {
    if (customCompetitor.trim() && !competitors.includes(customCompetitor.trim())) {
      setCompetitors(prev => [...prev, customCompetitor.trim()]);
      setCustomCompetitor("");
    }
  };

  const removeCompetitor = (comp: string) => {
    setCompetitors(prev => prev.filter(c => c !== comp));
  };

  const handleConfirm = () => {
    onConfirm({
      ...editedContext,
      selectedKeywords,
      confirmedCompetitors: competitors,
    });
  };

  const [removedCustomKeywords, setRemovedCustomKeywords] = useState<string[]>([]);
  const allKeywords = Array.from(new Set([...suggestedKeywords, ...selectedKeywords, ...removedCustomKeywords]));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirm Your Business Details
          </DialogTitle>
          <DialogDescription>
            We analyzed <span className="font-medium text-foreground">{websiteUrl}</span> and detected these details. 
            Please verify they're correct before we generate your content recommendations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Industry Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Industry</Label>
            <p className="text-sm text-muted-foreground">
              Select your industry or add a custom one. This ensures topic recommendations match your business.
            </p>
            <AeoTip>
              AI platforms like ChatGPT and Perplexity categorize content by industry. Selecting the right industry helps us recommend topics that match what AI systems expect from your sector.
            </AeoTip>
            <div className="flex flex-wrap gap-2">
              {allIndustries.map((industry) => (
                <Badge
                  key={industry}
                  variant={selectedIndustry === industry ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1.5 px-3 ${
                    selectedIndustry === industry 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => handleIndustrySelect(industry)}
                >
                  {selectedIndustry === industry && <Check className="h-3 w-3 mr-1" />}
                  {industry}
                </Badge>
              ))}
              {!showCustomIndustry ? (
                <Badge
                  variant="outline"
                  className="cursor-pointer text-sm py-1.5 px-3 hover:bg-muted border-dashed"
                  onClick={() => setShowCustomIndustry(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Custom
                </Badge>
              ) : (
                <div className="relative" ref={autocompleteRef}>
                  <div className="flex gap-2 items-center">
                    <Input
                      value={customIndustry}
                      onChange={(e) => setCustomIndustry(e.target.value)}
                      placeholder="Start typing..."
                      className="h-8 w-56"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomIndustry();
                        }
                      }}
                    />
                    <Button size="sm" variant="ghost" onClick={() => handleAddCustomIndustry()}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowCustomIndustry(false); setCustomIndustry(""); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {showAutocomplete && (
                    <div className="absolute z-50 w-56 mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {industryAutocomplete.map((ind) => (
                        <div
                          key={ind}
                          className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground text-sm text-foreground"
                          onClick={() => handleAddCustomIndustry(ind)}
                        >
                          {ind}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Business Type */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">Business Type</Label>
            <AeoTip>
              Different business types need different content strategies. SaaS companies benefit from tutorials and documentation, while agencies need case studies and thought leadership.
            </AeoTip>
            <div className="flex flex-wrap gap-2">
              {['Service Provider', 'SaaS', 'E-commerce', 'Marketplace', 'Agency', 'Consultant', 'B2B', 'B2C', 'D2C'].map((type) => (
                <Badge
                  key={type}
                  variant={editedContext.businessType === type ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1.5 px-3 ${
                    editedContext.businessType === type 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setEditedContext(prev => ({ ...prev, businessType: type }))}
                >
                  {editedContext.businessType === type && <Check className="h-3 w-3 mr-1" />}
                  {type}
                </Badge>
              ))}
            </div>
          </div>

          {/* Target Audience */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">Target Audience</Label>
            <AeoTip>
              When users ask AI platforms questions, they often specify their role or situation. Knowing your audience helps us recommend content that matches how your customers phrase their queries.
            </AeoTip>
            <Input
              value={editedContext.targetAudience}
              onChange={(e) => setEditedContext(prev => ({ ...prev, targetAudience: e.target.value }))}
              placeholder="Who are your primary customers?"
              className="w-full"
            />
          </div>

          {/* Keywords - Interactive */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Keywords</Label>
            <p className="text-sm text-muted-foreground">
              Use arrows to reorder (top = highest priority). Click ✕ to remove a keyword, or click an unselected keyword to add it back.
            </p>
            <AeoTip>
              <strong>Regional targeting tip:</strong> Unlike traditional SEO, AI search doesn't have country filters. To target specific regions (e.g., Australia, NZ), add regional terms directly to your keywords like "CRM Australia" or "accounting software NZ". The keyword itself carries the geographic intent.
            </AeoTip>
            <div className="flex flex-wrap gap-2">
              {allKeywords.map((keyword) => {
                const isSelected = selectedKeywords.includes(keyword);
                const priorityIndex = selectedKeywords.indexOf(keyword);
                const isFirst = priorityIndex === 0;
                const isLast = priorityIndex === selectedKeywords.length - 1;
                return isSelected ? (
                  <Badge
                    key={keyword}
                    variant="default"
                    className="text-sm py-1 px-2 select-none bg-primary text-primary-foreground"
                  >
                    <div className="flex items-center gap-1 mr-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveKeywordUp(keyword, e); }}
                        disabled={isFirst}
                        className={`p-0.5 rounded hover:bg-primary-foreground/20 ${isFirst ? 'opacity-30 cursor-not-allowed' : ''}`}
                        title="Move up (higher priority)"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveKeywordDown(keyword, e); }}
                        disabled={isLast}
                        className={`p-0.5 rounded hover:bg-primary-foreground/20 ${isLast ? 'opacity-30 cursor-not-allowed' : ''}`}
                        title="Move down (lower priority)"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <span className="text-xs opacity-70 font-medium">#{priorityIndex + 1}</span>
                    </div>
                    {keyword}
                    <X
                      className="h-3 w-3 ml-2 cursor-pointer hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); toggleKeyword(keyword); }}
                    />
                  </Badge>
                ) : (
                  <Badge
                    key={keyword}
                    variant="outline"
                    className="cursor-pointer text-sm py-1 px-2 select-none opacity-50 hover:opacity-100"
                    onClick={() => toggleKeyword(keyword)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {keyword}
                  </Badge>
                );
              })}
            </div>
            <div className="flex gap-2 items-center mt-2">
              <Input
                value={customKeyword}
                onChange={(e) => setCustomKeyword(e.target.value)}
                placeholder="Add custom keyword..."
                className="h-8 w-56"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomKeyword())}
              />
              <Button size="sm" variant="outline" onClick={addCustomKeyword} disabled={!customKeyword.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          {/* Competitors */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Competitors
            </Label>
            <p className="text-sm text-muted-foreground">
              Add competitors you want to outrank. Topics will be generated to help you compete with their content.
            </p>
            <AeoTip>
              These are competitors whose content AI platforms currently cite. We'll analyze their strengths and weaknesses to find content opportunities where you can outrank them in AI search results.
            </AeoTip>
            <div className="flex flex-wrap gap-2">
              {competitors.map((comp) => (
                <Badge
                  key={comp}
                  variant="secondary"
                  className="text-sm py-1.5 px-3"
                >
                  {comp}
                  <X 
                    className="h-3 w-3 ml-2 cursor-pointer hover:text-destructive" 
                    onClick={() => removeCompetitor(comp)}
                  />
                </Badge>
              ))}
              {competitors.length === 0 && (
                <span className="text-sm text-muted-foreground italic">No competitors added yet</span>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <Input
                value={customCompetitor}
                onChange={(e) => setCustomCompetitor(e.target.value)}
                placeholder="competitor.com"
                className="h-8 w-56"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
              />
              <Button size="sm" variant="outline" onClick={addCompetitor} disabled={!customCompetitor.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || selectedKeywords.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Confirm & Generate Topics
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
