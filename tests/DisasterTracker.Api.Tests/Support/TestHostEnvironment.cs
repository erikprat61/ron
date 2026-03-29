using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace DisasterTracker.Api.Tests.Support;

public sealed class TestHostEnvironment : IHostEnvironment
{
    public TestHostEnvironment(string contentRootPath)
    {
        ContentRootPath = contentRootPath;
        ContentRootFileProvider = new PhysicalFileProvider(contentRootPath);
    }

    public string EnvironmentName { get; set; } = Environments.Development;

    public string ApplicationName { get; set; } = "DisasterTracker.Api.Tests";

    public string ContentRootPath { get; set; }

    public IFileProvider ContentRootFileProvider { get; set; }
}
