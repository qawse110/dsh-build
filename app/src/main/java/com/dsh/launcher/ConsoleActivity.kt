package com.dsh.launcher

import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import kotlin.concurrent.thread

/**
 * 内置命令控制台（基于 Java ProcessBuilder，不依赖受限的 PTY 原生库）。
 *
 * 说明：libtermux.so 的 createSubprocess 在第三方 app 中受 Android seccomp
 * 限制，无法可靠 fork/exec shell，导致 PTY 终端黑屏。这里改用 ProcessBuilder，
 * 稳定启动 /system/bin/sh 或内置 Node，并实时回显 stdout/stderr。
 */
class ConsoleActivity : AppCompatActivity() {

    private lateinit var output: TextView
    private lateinit var input: EditText
    private lateinit var stateView: TextView
    private val sb = StringBuilder()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppLog.init(this)
        setContentView(buildUi())
        appendLine("== 内置命令控制台（基于 ProcessBuilder）==")
        val runNode = intent?.getBooleanExtra("node", false) ?: false
        val cmd = intent?.getStringExtra("cmd")
        when {
            runNode -> { appendLine(">> 触发内置 Node 解压+运行…"); AppLog.i("Console", "auto node run"); runNodeCmd() }
            !cmd.isNullOrBlank() -> {
                appendLine(">> " + cmd)
                AppLog.i("Console", "auto cmd: $cmd")
                runCommand(cmd)
            }
            else -> {
                appendLine("输入命令后回车执行，例如：")
                appendLine("  node --version")
                appendLine("  ls -la")
                appendLine("  echo hello")
            }
        }
    }

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF0B0B0F.toInt())
        }

        output = TextView(this).apply {
            setTextColor(0xFFE0E0E0.toInt())
            textSize = 13f
            setTypeface(android.graphics.Typeface.MONOSPACE)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setLineSpacing(dp(2).toFloat(), 1f)
        }

        val scroll = ScrollView(this).apply {
            addView(output, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }

        stateView = TextView(this).apply {
            text = "状态：空闲"
            textSize = 12f
            setTextColor(0xFF9A9A9A.toInt())
            setPadding(dp(12), dp(8), dp(12), dp(4))
        }

        input = EditText(this).apply {
            hint = "输入命令，回车执行"
            setTextColor(0xFFFFFFFF.toInt())
            setHintTextColor(0xFF888888.toInt())
            setBackgroundColor(0xFF20242D.toInt())
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setOnEditorActionListener { _, _, _ ->
                execInput()
                true
            }
        }

        val runBtn = Button(this).apply {
            text = "执行"
            textSize = 14f
            isAllCaps = false
            setOnClickListener { execInput() }
        }
        val nodeBtn = Button(this).apply {
            text = "Node"
            textSize = 14f
            isAllCaps = false
            setOnClickListener { runNodeCmd() }
        }
        val clearBtn = Button(this).apply {
            text = "清空"
            textSize = 14f
            isAllCaps = false
            setOnClickListener { sb.clear(); output.text = "" }
        }
        val closeBtn = Button(this).apply {
            text = "退出"
            textSize = 14f
            isAllCaps = false
            setOnClickListener { finish() }
        }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(nodeBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(runBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(clearBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(closeBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }

        root.addView(stateView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        return root
    }

    private fun execInput() {
        val cmd = input.text.toString().trim()
        if (cmd.isNotEmpty()) {
            appendLine("$ $cmd")
            input.setText("")
            runCommand(cmd)
        }
    }

    /** 用内置 Node 运行时执行命令。 */
    private fun runNodeCmd() {
        appendLine(">> 正在准备内置 Node 运行时…")
        setState("正在解压/准备 Node…")
        thread {
            try {
                val nodeDir = NodeRuntime.ensureExtracted(this)
                val cmd = "${NodeRuntime.nodeEnvPrefix(this)} $nodeDir/bin/node --version"
                appendLine("$ " + cmd.replace(";", " && "))
                runCommand(cmd)
            } catch (t: Throwable) {
                appendLine("✗ Node 准备失败：${t.message}")
                setState("出错")
            }
        }
    }

    /** 通过 ProcessBuilder 执行命令，实时回显输出。 */
    private fun runCommand(raw: String) {
        setState("运行中…")
        AppLog.i("Console", "cmd: $raw | env LD_LIBRARY_PATH=" + File(filesDir, "node/lib").absolutePath)
        thread {
            try {
                // 用 /system/bin/sh -c 执行，这样支持管道/重定向/环境变量
                val pb = ProcessBuilder("/system/bin/sh", "-c", raw)
                pb.redirectErrorStream(true)
                val env = pb.environment()
                env["PATH"] = listOf(
                    "/data/data/com.dsh.launcher/files/node/bin",
                    "/system/bin", "/bin", "/usr/bin"
                ).joinToString(":")
                env["HOME"] = "/data/data/com.dsh.launcher/files"
                env["TERM"] = "xterm-256color"
                env["LD_LIBRARY_PATH"] = File(filesDir, "node/lib").absolutePath
                env["TMPDIR"] = File(filesDir, "node/tmp").absolutePath
                env["OPENSSL_CONF"] = "/dev/null"

                val proc = pb.start()
                // 实时逐行回显
                proc.inputStream.bufferedReader().useLines { lines ->
                    lines.forEach { line ->
                        appendLine(line)
                        AppLog.i("ConsoleOut", line)
                    }
                }
                val exit = proc.waitFor()
                AppLog.i("Console", "exit code: $exit")
                setState("完成（退出码 $exit）")
                appendLine("[退出码: $exit]")
                appendLine("")
                appendLine("如需继续，在下方输入命令回车；点“清空”可清理屏幕。")
            } catch (e: Exception) {
                AppLog.e("Console", "cmd failed: " + (e.message ?: e.toString()))
                setState("出错")
                appendLine("[执行失败: ${e.message}]")
            }
        }
    }

    private fun setState(s: String) {
        runOnUiThread { stateView.text = "状态：$s" }
    }

    private fun appendLine(line: String) {
        runOnUiThread {
            sb.append(line).append("\n")
            output.text = sb.toString()
            // 自动滚到底部
            (output.parent as? ScrollView)?.fullScroll(View.FOCUS_DOWN)
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
