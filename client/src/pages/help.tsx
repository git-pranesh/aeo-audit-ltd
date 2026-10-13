import { ArrowLeft, MessageCircle, Mail, BookOpen, Video, FileQuestion, Zap, Shield, CreditCard, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function HelpSupport() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Help & Support</h1>
                <p className="text-sm text-muted-foreground">Get answers and assistance</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Quick Contact Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="border-primary/20 hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <MessageCircle className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Live Chat</CardTitle>
              <CardDescription>Chat with our support team</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={() => window.location.href = '/coming-soon?feature=Live Chat'}
              >
                Start Chat
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/20 hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Email Support</CardTitle>
              <CardDescription>Get help via email</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="secondary"
                onClick={() => window.location.href = 'mailto:support@aicitation.com?subject=Support Request'}
              >
                Send Email
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/20 hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="w-12 h-12 bg-gray-500/10 rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="h-6 w-6 text-gray-600" />
              </div>
              <CardTitle>Documentation</CardTitle>
              <CardDescription>Browse our guides</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline" 
                onClick={() => window.location.href = '/coming-soon?feature=Documentation'}
              >
                View Docs
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Section */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Frequently Asked Questions</h2>
            <p className="text-muted-foreground">Quick answers to common questions</p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {/* Getting Started */}
            <AccordionItem value="item-1" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center space-x-3 text-left">
                  <Zap className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="font-semibold">How does the AI Readiness Audit work?</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4">
                Our AI analyzes your website across 4 major AI platforms (ChatGPT, Perplexity, Gemini, and Claude) to determine how visible you are in AI-powered search results. We identify content gaps, generate topics that AI platforms are likely to cite, and provide actionable recommendations to improve your AI search visibility.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center space-x-3 text-left">
                  <FileQuestion className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="font-semibold">What's the difference between plan tiers?</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4">
                <ul className="space-y-2">
                  <li><strong>Free Plan:</strong> 1 audit/month, 10 topics per category (40 total topics)</li>
                  <li><strong>Starter ($49/mo):</strong> 5 audits/month, 25 topics per category (100 total topics)</li>
                  <li><strong>Pro ($149/mo):</strong> 20 audits/month, 50 topics per category (200 total topics)</li>
                  <li><strong>Enterprise ($299/mo):</strong> Unlimited audits, 100 topics per category (400 total topics)</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center space-x-3 text-left">
                  <Shield className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="font-semibold">How accurate are the audit results?</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4">
                Our AI uses real-time data from Perplexity's online models and analyzes millions of successful citations. The topics we generate are based on actual search patterns, competitor analysis, and market opportunities. Accuracy improves with higher-tier plans that generate more comprehensive topic lists.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center space-x-3 text-left">
                  <CreditCard className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="font-semibold">How do I upgrade or cancel my subscription?</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4">
                You can upgrade your plan anytime from the Dashboard or Pricing page. To cancel, go to your Dashboard and click "Manage Subscription". Cancellations take effect at the end of your current billing period, so you can continue using premium features until then.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center space-x-3 text-left">
                  <Video className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="font-semibold">Can I export my audit results?</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4">
                Yes! Every audit can be exported as:
                <ul className="mt-2 space-y-1 ml-4">
                  <li>• <strong>PDF Report:</strong> Beautiful formatted report with all topics and insights</li>
                  <li>• <strong>CSV Export:</strong> Spreadsheet-ready data for further analysis</li>
                  <li>• <strong>Share Link:</strong> Shareable link to your audit results</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center space-x-3 text-left">
                  <Users className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="font-semibold">How long does an audit take?</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4">
                Audit processing time depends on your plan:
                <ul className="mt-2 space-y-1 ml-4">
                  <li>• <strong>Free Plan (10 topics):</strong> ~10-15 seconds</li>
                  <li>• <strong>Starter Plan (25 topics):</strong> ~15-25 seconds</li>
                  <li>• <strong>Pro Plan (50 topics):</strong> ~30-40 seconds</li>
                  <li>• <strong>Enterprise Plan (100 topics):</strong> ~40-60 seconds</li>
                </ul>
                Higher topic counts use batch processing with deduplication for quality.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-7" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center space-x-3 text-left">
                  <Shield className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="font-semibold">Is my data secure and private?</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4">
                Absolutely! We use Firebase Authentication and Firestore for secure data storage. Your audit results are private and only accessible to you. We don't share your data with third parties, and all API communications are encrypted. Batch audits are not saved to the database for privacy.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-8" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center space-x-3 text-left">
                  <Zap className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="font-semibold">What are "Topics per Category"?</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4">
                Topics are organized into 4 categories based on confidence levels:
                <ul className="mt-2 space-y-2 ml-4">
                  <li>• <strong>Authoritative (85-95%):</strong> High-confidence topics where you can become a go-to source</li>
                  <li>• <strong>Thought Leadership (70-84%):</strong> Industry insights and trend analysis topics</li>
                  <li>• <strong>Competitive Advantage (50-69%):</strong> Topics where you can outperform competitors</li>
                  <li>• <strong>Emerging Opportunity (30-49%):</strong> New market opportunities with growth potential</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Contact Section */}
        <Card className="bg-gradient-to-br from-primary/5 to-gray-500/5 border-primary/20">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Still Need Help?</CardTitle>
            <CardDescription>Our team is here to assist you</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button 
                size="lg"
                onClick={() => window.location.href = 'mailto:support@aicitation.com?subject=Support Request'}
              >
                <Mail className="h-5 w-5 mr-2" />
                Email Support
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => window.location.href = '/'}
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back to Home
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-6">
              Average response time: <strong className="text-foreground">2-4 hours</strong> (business days)
            </p>
          </CardContent>
        </Card>

        {/* Resources Section */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6 text-center">Helpful Resources</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card 
              className="hover:shadow-lg transition-shadow cursor-pointer" 
              onClick={() => window.location.href = '/coming-soon?feature=Video Tutorials'}
            >
              <CardContent className="p-6 text-center">
                <Video className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Video Tutorials</h3>
                <p className="text-sm text-muted-foreground">Watch step-by-step guides</p>
              </CardContent>
            </Card>

            <Card 
              className="hover:shadow-lg transition-shadow cursor-pointer" 
              onClick={() => window.location.href = '/coming-soon?feature=Knowledge Base'}
            >
              <CardContent className="p-6 text-center">
                <BookOpen className="h-8 w-8 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Knowledge Base</h3>
                <p className="text-sm text-muted-foreground">Browse articles & guides</p>
              </CardContent>
            </Card>

            <Card 
              className="hover:shadow-lg transition-shadow cursor-pointer" 
              onClick={() => window.location.href = '/coming-soon?feature=API Documentation'}
            >
              <CardContent className="p-6 text-center">
                <Zap className="h-8 w-8 text-yellow-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-2">API Documentation</h3>
                <p className="text-sm text-muted-foreground">Integrate with our API</p>
              </CardContent>
            </Card>

            <Card 
              className="hover:shadow-lg transition-shadow cursor-pointer" 
              onClick={() => window.location.href = '/coming-soon?feature=Community Forum'}
            >
              <CardContent className="p-6 text-center">
                <Users className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Community Forum</h3>
                <p className="text-sm text-muted-foreground">Connect with other users</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

