import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, RefreshCw, Eye } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface HomePageContent {
  logo: {
    icon: string;
    text: string;
    subtext: string;
  };
  hero: {
    title: string;
    subtitle: string;
    description: string;
    showHeroSection: boolean;
    showPlatformBadges: boolean;
  };
  features: {
    feature1Title: string;
    feature1Description: string;
    feature2Title: string;
    feature2Description: string;
    feature3Title: string;
    feature3Description: string;
    feature4Title: string;
    feature4Description: string;
  };
  footer: {
    companyName: string;
    description: string;
    copyright: string;
  };
  helpLink: string;
  loadingMessages: string[];
}

const DEFAULT_CONTENT: HomePageContent = {
  logo: {
    icon: "🔍",
    text: "AI Readiness Score",
    subtext: "Optimize Your AI Readiness"
  },
  hero: {
    title: "Find Out Why AI Isn't Recommending Your Business — And Get the Exact Playbook to Fix It",
    subtitle: "AI Readiness Score",
    description: "Citation Rocket analyzes your website against 20+ content signals, benchmarks you against your industry, and gives you a step-by-step fix-it plan so ChatGPT, Perplexity, Gemini, and Claude start recommending you.",
    showHeroSection: true,
    showPlatformBadges: false
  },
  features: {
    feature1Title: "ChatGPT Analysis",
    feature1Description: "See how ChatGPT understands and cites your content",
    feature2Title: "Perplexity Insights",
    feature2Description: "Discover your visibility in Perplexity's AI search",
    feature3Title: "Gemini Evaluation",
    feature3Description: "Understand how Google's AI sees your website",
    feature4Title: "Claude Assessment",
    feature4Description: "Get insights on Anthropic's Claude AI platform"
  },
  footer: {
    companyName: "Citation Rocket",
    description: "Helping websites get recommended by AI search engines through comprehensive auditing and optimization.",
    copyright: "© 2026 Citation Rocket. All rights reserved."
  },
  helpLink: "/help",
  loadingMessages: [
    "Good things take time—like getting recommended by AI engines..",
    "Analyzing how ChatGPT, Perplexity, Gemini, and Claude view your website",
    "Scanning 1000+ AI search patterns to find your AI readiness opportunities..",
    "Comparing your domain authority against top-ranked AI recommendations...",
    "Identifying content gaps where your competitors are getting recommended...",
    "We're building your roadmap to AI search dominance. Worth the wait!",
    "Fun fact: 99% of businesses aren't on AI search radar. You're about to join the 1%.",
    "Deep analysis in progress—your competitors wish they had this intel...",
    "Processing enterprise-grade analysis: 4 platforms × 100 topics × readiness algorithms...",
    "Our AI is analyzing millions of successful AI recommendations to predict your best topics...",
    "Running advanced entity recognition and content structure optimization...",
    "Brewing 100+ topics that AI platforms will love recommending. Almost there!"
  ]
};

export default function HomeContentManager() {
  const { toast } = useToast();
  const [content, setContent] = useState<HomePageContent>(DEFAULT_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      setLoading(true);
      const docRef = doc(db, 'settings', 'homePageContent');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const savedData = docSnap.data();
        // Merge saved data with defaults to ensure all fields exist
        const mergedContent = {
          logo: { ...DEFAULT_CONTENT.logo, ...(savedData.logo || {}) },
          hero: { ...DEFAULT_CONTENT.hero, ...(savedData.hero || {}) },
          features: { ...DEFAULT_CONTENT.features, ...(savedData.features || {}) },
          footer: { ...DEFAULT_CONTENT.footer, ...(savedData.footer || {}) },
          helpLink: savedData.helpLink || DEFAULT_CONTENT.helpLink,
          loadingMessages: savedData.loadingMessages || DEFAULT_CONTENT.loadingMessages
        };
        setContent(mergedContent as HomePageContent);
        console.log('✅ Home page content loaded');
      } else {
        console.log('ℹ️ No saved content, using defaults');
        setContent(DEFAULT_CONTENT);
      }
    } catch (error) {
      console.error('❌ Error loading home page content:', error);
      toast({
        title: "Load Failed",
        description: "Could not load content. Using defaults.",
        variant: "destructive",
      });
      setContent(DEFAULT_CONTENT);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const docRef = doc(db, 'settings', 'homePageContent');
      await setDoc(docRef, content);

      toast({
        title: "✅ Saved Successfully",
        description: "Home page content has been updated.",
      });

      console.log('✅ Home page content saved:', content);
    } catch (error) {
      console.error('❌ Error saving home page content:', error);
      toast({
        title: "Save Failed",
        description: "Could not save content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset to default content? This cannot be undone.')) {
      setContent(DEFAULT_CONTENT);
      toast({
        title: "Reset Complete",
        description: "Content reset to defaults. Don't forget to save!",
      });
    }
  };

  const handlePreview = () => {
    window.open('/', '_blank');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Home Page Content Manager</h2>
          <p className="text-muted-foreground">Update all home page content from one place</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePreview}>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Logo Section */}
      <Card>
        <CardHeader>
          <CardTitle>Logo & Branding</CardTitle>
          <CardDescription>Logo displayed in the header</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="logo-icon">Logo Icon/Emoji</Label>
            <Input
              id="logo-icon"
              value={content.logo.icon}
              onChange={(e) => setContent({ ...content, logo: { ...content.logo, icon: e.target.value } })}
              placeholder="🔍"
              maxLength={5}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use an emoji (🔍) or image URL. If URL, will display as image.
            </p>
          </div>

          <div>
            <Label htmlFor="logo-text">Logo Text (Main)</Label>
            <Input
              id="logo-text"
              value={content.logo.text}
              onChange={(e) => setContent({ ...content, logo: { ...content.logo, text: e.target.value } })}
              placeholder="AI Readiness Score"
            />
          </div>

          <div>
            <Label htmlFor="logo-subtext">Logo Subtext (Below main text)</Label>
            <Input
              id="logo-subtext"
              value={content.logo.subtext}
              onChange={(e) => setContent({ ...content, logo: { ...content.logo, subtext: e.target.value } })}
              placeholder="Get Found in AI Search"
            />
          </div>
        </CardContent>
      </Card>

      {/* Hero Section */}
      <Card>
        <CardHeader>
          <CardTitle>Hero Section</CardTitle>
          <CardDescription>Main banner content at the top of the page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="hero-subtitle">Subtitle (Small text above title)</Label>
            <Input
              id="hero-subtitle"
              value={content.hero.subtitle}
              onChange={(e) => setContent({ ...content, hero: { ...content.hero, subtitle: e.target.value } })}
              placeholder="AI Readiness Score"
            />
          </div>

          <div>
            <Label htmlFor="hero-title">Main Title (Large heading)</Label>
            <Input
              id="hero-title"
              value={content.hero.title}
              onChange={(e) => setContent({ ...content, hero: { ...content.hero, title: e.target.value } })}
              placeholder="Get Found in AI Search"
              className="text-lg font-semibold"
            />
          </div>

          <div>
            <Label htmlFor="hero-description">Description (Below title)</Label>
            <Textarea
              id="hero-description"
              value={content.hero.description}
              onChange={(e) => setContent({ ...content, hero: { ...content.hero, description: e.target.value } })}
              placeholder="Discover how ChatGPT, Perplexity, Gemini, and Claude see your website..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30">
            <div>
              <Label htmlFor="show-hero-section" className="text-base font-medium">Show Hero Section</Label>
              <p className="text-sm text-muted-foreground">Display the headline, subtitle, and description above the audit form</p>
            </div>
            <Switch
              id="show-hero-section"
              checked={content.hero.showHeroSection !== false}
              onCheckedChange={(checked) => setContent({ ...content, hero: { ...content.hero, showHeroSection: checked } })}
            />
          </div>

          <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30">
            <div>
              <Label htmlFor="show-platform-badges" className="text-base font-medium">Show Platform Badges</Label>
              <p className="text-sm text-muted-foreground">Display ChatGPT, Perplexity, Gemini, Claude badges below hero</p>
            </div>
            <Switch
              id="show-platform-badges"
              checked={content.hero.showPlatformBadges}
              onCheckedChange={(checked) => setContent({ ...content, hero: { ...content.hero, showPlatformBadges: checked } })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Features Section */}
      <Card>
        <CardHeader>
          <CardTitle>Features Section</CardTitle>
          <CardDescription>4 platform features (ChatGPT, Perplexity, Gemini, Claude)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Feature 1 */}
            <div className="space-y-2 p-4 border border-border rounded-lg">
              <h4 className="font-semibold text-sm text-primary">Feature 1</h4>
              <div>
                <Label htmlFor="feature1-title">Title</Label>
                <Input
                  id="feature1-title"
                  value={content.features.feature1Title}
                  onChange={(e) => setContent({ ...content, features: { ...content.features, feature1Title: e.target.value } })}
                  placeholder="ChatGPT Analysis"
                />
              </div>
              <div>
                <Label htmlFor="feature1-desc">Description</Label>
                <Textarea
                  id="feature1-desc"
                  value={content.features.feature1Description}
                  onChange={(e) => setContent({ ...content, features: { ...content.features, feature1Description: e.target.value } })}
                  rows={2}
                />
              </div>
            </div>

            {/* Feature 2 */}
            <div className="space-y-2 p-4 border border-border rounded-lg">
              <h4 className="font-semibold text-sm text-green-600">Feature 2</h4>
              <div>
                <Label htmlFor="feature2-title">Title</Label>
                <Input
                  id="feature2-title"
                  value={content.features.feature2Title}
                  onChange={(e) => setContent({ ...content, features: { ...content.features, feature2Title: e.target.value } })}
                  placeholder="Perplexity Insights"
                />
              </div>
              <div>
                <Label htmlFor="feature2-desc">Description</Label>
                <Textarea
                  id="feature2-desc"
                  value={content.features.feature2Description}
                  onChange={(e) => setContent({ ...content, features: { ...content.features, feature2Description: e.target.value } })}
                  rows={2}
                />
              </div>
            </div>

            {/* Feature 3 */}
            <div className="space-y-2 p-4 border border-border rounded-lg">
              <h4 className="font-semibold text-sm text-orange-600">Feature 3</h4>
              <div>
                <Label htmlFor="feature3-title">Title</Label>
                <Input
                  id="feature3-title"
                  value={content.features.feature3Title}
                  onChange={(e) => setContent({ ...content, features: { ...content.features, feature3Title: e.target.value } })}
                  placeholder="Gemini Evaluation"
                />
              </div>
              <div>
                <Label htmlFor="feature3-desc">Description</Label>
                <Textarea
                  id="feature3-desc"
                  value={content.features.feature3Description}
                  onChange={(e) => setContent({ ...content, features: { ...content.features, feature3Description: e.target.value } })}
                  rows={2}
                />
              </div>
            </div>

            {/* Feature 4 */}
            <div className="space-y-2 p-4 border border-border rounded-lg">
              <h4 className="font-semibold text-sm text-gray-600">Feature 4</h4>
              <div>
                <Label htmlFor="feature4-title">Title</Label>
                <Input
                  id="feature4-title"
                  value={content.features.feature4Title}
                  onChange={(e) => setContent({ ...content, features: { ...content.features, feature4Title: e.target.value } })}
                  placeholder="Claude Assessment"
                />
              </div>
              <div>
                <Label htmlFor="feature4-desc">Description</Label>
                <Textarea
                  id="feature4-desc"
                  value={content.features.feature4Description}
                  onChange={(e) => setContent({ ...content, features: { ...content.features, feature4Description: e.target.value } })}
                  rows={2}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading Messages Section */}
      <Card>
        <CardHeader>
          <CardTitle>Loading Messages</CardTitle>
          <CardDescription>Messages shown during audit analysis (rotates every 4 seconds)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(content.loadingMessages || []).map((message, index) => (
            <div key={index} className="flex gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">{index + 1}</span>
              </div>
              <Textarea
                value={message}
                onChange={(e) => {
                  const newMessages = [...content.loadingMessages];
                  newMessages[index] = e.target.value;
                  setContent({ ...content, loadingMessages: newMessages });
                }}
                placeholder={`Loading message ${index + 1}`}
                rows={2}
                className="flex-1"
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setContent({
                ...content,
                loadingMessages: [...content.loadingMessages, "New loading message..."]
              });
            }}
          >
            + Add Message
          </Button>
        </CardContent>
      </Card>

      {/* Header Links Section */}
      <Card>
        <CardHeader>
          <CardTitle>Header Links</CardTitle>
          <CardDescription>Configure header navigation links</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="help-link">Help Button Link</Label>
            <Input
              id="help-link"
              value={content.helpLink}
              onChange={(e) => setContent({ ...content, helpLink: e.target.value })}
              placeholder="/help"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Link for the (?) help button in the header. Use /help or external URL.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer Section */}
      <Card>
        <CardHeader>
          <CardTitle>Footer Section</CardTitle>
          <CardDescription>Footer content at the bottom of the page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="footer-company">Company Name</Label>
            <Input
              id="footer-company"
              value={content.footer.companyName}
              onChange={(e) => setContent({ ...content, footer: { ...content.footer, companyName: e.target.value } })}
              placeholder="Citation Rocket"
            />
          </div>

          <div>
            <Label htmlFor="footer-description">Description</Label>
            <Textarea
              id="footer-description"
              value={content.footer.description}
              onChange={(e) => setContent({ ...content, footer: { ...content.footer, description: e.target.value } })}
              placeholder="Helping websites get discovered by AI search engines..."
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="footer-copyright">Copyright Text</Label>
            <Input
              id="footer-copyright"
              value={content.footer.copyright}
              onChange={(e) => setContent({ ...content, footer: { ...content.footer, copyright: e.target.value } })}
              placeholder="© 2024 Citation Rocket. All rights reserved."
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button (Bottom) */}
      <div className="flex justify-end gap-2 sticky bottom-4 bg-background/80 backdrop-blur-sm p-4 rounded-lg border border-border">
        <Button variant="outline" onClick={handleReset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset to Default
        </Button>
        <Button onClick={handleSave} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save All Changes'}
        </Button>
      </div>
    </div>
  );
}

